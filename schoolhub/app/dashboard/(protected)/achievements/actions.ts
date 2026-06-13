"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveSchool } from "@/lib/context";

function toDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  studentName: z.string().trim().max(160).optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(3000).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export async function saveAchievement(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");

  const parsed = schema.safeParse({
    title: formData.get("title"),
    studentName: formData.get("studentName") || undefined,
    category: formData.get("category") || undefined,
    description: formData.get("description") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
  });
  if (!parsed.success) redirect("/achievements?error=1");

  const data = {
    title: parsed.data.title,
    studentName: parsed.data.studentName || null,
    category: parsed.data.category || null,
    description: parsed.data.description || null,
    imageUrl: parsed.data.imageUrl || null,
    achievedOn: toDate(formData.get("achievedOn")),
  };

  if (id) {
    await prisma.achievement.updateMany({
      where: { id, schoolId: school.id },
      data,
    });
  } else {
    await prisma.achievement.create({ data: { ...data, schoolId: school.id } });
  }

  revalidatePath("/achievements");
  redirect("/achievements");
}

export async function deleteAchievement(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");
  await prisma.achievement.deleteMany({ where: { id, schoolId: school.id } });
  revalidatePath("/achievements");
  redirect("/achievements");
}
