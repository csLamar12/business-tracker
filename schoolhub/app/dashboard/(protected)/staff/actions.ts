"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveSchool } from "@/lib/context";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  department: z.string().trim().max(160).optional().or(z.literal("")),
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  photoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function saveStaff(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");

  const parsed = schema.safeParse({
    name: formData.get("name"),
    title: formData.get("title"),
    department: formData.get("department") || undefined,
    bio: formData.get("bio") || undefined,
    email: formData.get("email") || undefined,
    photoUrl: formData.get("photoUrl") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) redirect("/staff?error=1");

  const data = {
    name: parsed.data.name,
    title: parsed.data.title,
    department: parsed.data.department || null,
    bio: parsed.data.bio || null,
    email: parsed.data.email || null,
    photoUrl: parsed.data.photoUrl || null,
    sortOrder: parsed.data.sortOrder,
  };

  if (id) {
    await prisma.staffMember.updateMany({
      where: { id, schoolId: school.id },
      data,
    });
  } else {
    await prisma.staffMember.create({ data: { ...data, schoolId: school.id } });
  }

  revalidatePath("/staff");
  redirect("/staff");
}

export async function deleteStaff(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");
  await prisma.staffMember.deleteMany({ where: { id, schoolId: school.id } });
  revalidatePath("/staff");
  redirect("/staff");
}
