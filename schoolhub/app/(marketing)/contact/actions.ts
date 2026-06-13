"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/constants";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(160),
  schoolName: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  plan: z.enum(PLANS).optional(),
  message: z.string().trim().min(1, "Please tell us a little about your school").max(4000),
});

export async function submitContact(formData: FormData) {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    schoolName: formData.get("schoolName") || undefined,
    phone: formData.get("phone") || undefined,
    plan: (formData.get("plan") as string) || undefined,
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Please check the form.";
    redirect(`/contact?error=${encodeURIComponent(msg)}`);
  }

  const data = parsed.data;
  await prisma.contactMessage.create({
    data: {
      name: data.name,
      email: data.email,
      schoolName: data.schoolName || null,
      phone: data.phone || null,
      plan: data.plan || null,
      message: data.message,
    },
  });

  redirect("/contact?sent=1");
}
