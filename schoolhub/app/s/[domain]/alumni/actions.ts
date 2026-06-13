"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const schema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  gradYear: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter a 4-digit year")
    .optional()
    .or(z.literal("")),
  currentRole: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function registerAlumni(formData: FormData) {
  const parsed = schema.safeParse({
    schoolId: formData.get("schoolId"),
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    gradYear: formData.get("gradYear") || undefined,
    currentRole: formData.get("currentRole") || undefined,
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    redirect("/alumni?error=1");
  }

  const data = parsed.data;

  // Only accept registrations for a real, published school.
  const school = await prisma.school.findFirst({
    where: { id: data.schoolId, published: true },
    select: { id: true },
  });
  if (!school) redirect("/alumni?error=1");

  await prisma.alumniProfile.create({
    data: {
      schoolId: school.id,
      name: data.name,
      email: data.email || null,
      gradYear: data.gradYear ? Number(data.gradYear) : null,
      currentRole: data.currentRole || null,
      message: data.message || null,
      approved: false, // an admin reviews before it shows publicly
    },
  });

  revalidatePath("/alumni");
  redirect("/alumni?joined=1");
}
