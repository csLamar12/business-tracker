"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveSchool } from "@/lib/context";
import { CALENDAR_CATEGORIES } from "@/lib/constants";

function toDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  category: z.enum(CALENDAR_CATEGORIES),
});

export async function saveCalendarEntry(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");

  const startDate = toDate(formData.get("startDate"));
  if (!startDate) redirect("/calendar?error=1");
  const endDate = toDate(formData.get("endDate"));

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    category: formData.get("category"),
  });
  if (!parsed.success) redirect("/calendar?error=1");

  const data = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    category: parsed.data.category,
    startDate: startDate!,
    endDate,
  };

  if (id) {
    await prisma.calendarEntry.updateMany({
      where: { id, schoolId: school.id },
      data,
    });
  } else {
    await prisma.calendarEntry.create({
      data: { ...data, schoolId: school.id },
    });
  }

  revalidatePath("/calendar");
  redirect("/calendar");
}

export async function deleteCalendarEntry(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");
  await prisma.calendarEntry.deleteMany({ where: { id, schoolId: school.id } });
  revalidatePath("/calendar");
  redirect("/calendar");
}
