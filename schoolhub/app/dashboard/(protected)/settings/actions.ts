"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveSchool } from "@/lib/context";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/constants";
import { normalizeDomain, slugify } from "@/lib/utils";

const optionalUrl = z.string().trim().url().max(500).optional().or(z.literal(""));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0a4d8c");

const profileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  tagline: z.string().trim().max(300).optional().or(z.literal("")),
  motto: z.string().trim().max(200).optional().or(z.literal("")),
  aboutHtml: z.string().trim().max(8000).optional().or(z.literal("")),
  logoUrl: optionalUrl,
  heroImageUrl: optionalUrl,
  primaryColor: hex,
  secondaryColor: hex,
  principalName: z.string().trim().max(160).optional().or(z.literal("")),
  foundedYear: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional()
    .or(z.literal("")),
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  parish: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  facebookUrl: optionalUrl,
  instagramUrl: optionalUrl,
  twitterUrl: optionalUrl,
  youtubeUrl: optionalUrl,
});

export async function saveProfile(formData: FormData) {
  const school = await requireActiveSchool();

  const parsed = profileSchema.safeParse(
    Object.fromEntries(
      [
        "name",
        "tagline",
        "motto",
        "aboutHtml",
        "logoUrl",
        "heroImageUrl",
        "primaryColor",
        "secondaryColor",
        "principalName",
        "foundedYear",
        "addressLine",
        "parish",
        "phone",
        "email",
        "facebookUrl",
        "instagramUrl",
        "twitterUrl",
        "youtubeUrl",
      ].map((k) => [k, formData.get(k) ?? ""]),
    ),
  );

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Please check the form.";
    redirect(`/settings?error=${encodeURIComponent(msg)}`);
  }

  const d = parsed.data;
  await prisma.school.update({
    where: { id: school.id },
    data: {
      name: d.name,
      tagline: d.tagline || null,
      motto: d.motto || null,
      aboutHtml: d.aboutHtml || null,
      logoUrl: d.logoUrl || null,
      heroImageUrl: d.heroImageUrl || null,
      primaryColor: d.primaryColor,
      secondaryColor: d.secondaryColor,
      principalName: d.principalName || null,
      foundedYear: d.foundedYear ? Number(d.foundedYear) : null,
      addressLine: d.addressLine || null,
      parish: d.parish || null,
      phone: d.phone || null,
      email: d.email || null,
      facebookUrl: d.facebookUrl || null,
      instagramUrl: d.instagramUrl || null,
      twitterUrl: d.twitterUrl || null,
      youtubeUrl: d.youtubeUrl || null,
    },
  });

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

const RESERVED_SUBDOMAINS = new Set([
  "app",
  "www",
  "admin",
  "api",
  "mail",
  "static",
  "assets",
  "schoolhub",
]);

const domainSchema = z.object({
  subdomain: z
    .string()
    .trim()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  plan: z.enum(PLANS),
  customDomain: z.string().trim().max(255).optional().or(z.literal("")),
  published: z.boolean(),
});

/** Subdomain, plan, custom domain and publish state — platform admins only. */
export async function saveDomain(formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPERADMIN") redirect("/settings?error=Not%20authorised");
  const school = await requireActiveSchool();

  const parsed = domainSchema.safeParse({
    subdomain: slugify(String(formData.get("subdomain") || "")),
    plan: formData.get("plan"),
    customDomain: formData.get("customDomain") || undefined,
    published: formData.get("published") === "on",
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Please check the form.";
    redirect(`/settings?error=${encodeURIComponent(msg)}`);
  }

  const d = parsed.data;
  if (RESERVED_SUBDOMAINS.has(d.subdomain)) {
    redirect("/settings?error=That%20subdomain%20is%20reserved");
  }

  // Custom domains are a Premium feature only.
  const customDomain =
    d.plan === "PREMIUM" && d.customDomain
      ? normalizeDomain(d.customDomain)
      : null;

  // Uniqueness checks (excluding this school).
  const subTaken = await prisma.school.findFirst({
    where: { subdomain: d.subdomain, NOT: { id: school.id } },
    select: { id: true },
  });
  if (subTaken) redirect("/settings?error=Subdomain%20already%20taken");

  if (customDomain) {
    const domTaken = await prisma.school.findFirst({
      where: { customDomain, NOT: { id: school.id } },
      select: { id: true },
    });
    if (domTaken) redirect("/settings?error=Custom%20domain%20already%20in%20use");
  }

  await prisma.school.update({
    where: { id: school.id },
    data: {
      subdomain: d.subdomain,
      plan: d.plan,
      customDomain,
      published: d.published,
    },
  });

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
