"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { PLANS } from "@/lib/constants";
import { slugify } from "@/lib/utils";

async function requireSuperadmin() {
  const session = await getSession();
  if (session?.role !== "SUPERADMIN") redirect("/");
  return session;
}

const RESERVED = new Set([
  "app",
  "www",
  "admin",
  "api",
  "mail",
  "static",
  "assets",
  "schoolhub",
]);

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  subdomain: z.string().trim().max(63).optional().or(z.literal("")),
  plan: z.enum(PLANS),
  adminName: z.string().trim().min(1).max(160),
  adminEmail: z.string().trim().email().max(160),
  adminPassword: z.string().min(8).max(200),
});

export async function createSchool(formData: FormData) {
  await requireSuperadmin();

  const parsed = schema.safeParse({
    name: formData.get("name"),
    subdomain: formData.get("subdomain") || undefined,
    plan: formData.get("plan"),
    adminName: formData.get("adminName"),
    adminEmail: formData.get("adminEmail"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Please check the form.";
    redirect(`/schools?error=${encodeURIComponent(msg)}`);
  }

  const d = parsed.data;
  const subdomain = slugify(d.subdomain || d.name);
  if (!subdomain || RESERVED.has(subdomain)) {
    redirect("/schools?error=Invalid%20or%20reserved%20subdomain");
  }

  const email = d.adminEmail.toLowerCase();
  const [subTaken, emailTaken] = await Promise.all([
    prisma.school.findUnique({ where: { subdomain }, select: { id: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (subTaken) redirect("/schools?error=Subdomain%20already%20taken");
  if (emailTaken) redirect("/schools?error=Admin%20email%20already%20in%20use");

  const passwordHash = await hashPassword(d.adminPassword);

  await prisma.school.create({
    data: {
      name: d.name,
      subdomain,
      plan: d.plan,
      published: false,
      users: {
        create: {
          name: d.adminName,
          email,
          passwordHash,
          role: "SCHOOL_ADMIN",
        },
      },
    },
  });

  revalidatePath("/schools");
  redirect("/schools?created=1");
}

export async function deleteSchool(formData: FormData) {
  await requireSuperadmin();
  const id = String(formData.get("id") || "");
  await prisma.school.delete({ where: { id } });
  revalidatePath("/schools");
  redirect("/schools");
}
