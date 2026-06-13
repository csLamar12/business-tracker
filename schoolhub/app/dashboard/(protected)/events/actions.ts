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
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  published: z.boolean(),
});

export async function saveEvent(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");

  const startsAt = toDate(formData.get("startsAt"));
  if (!startsAt) redirect("/events?error=1");
  const endsAt = toDate(formData.get("endsAt"));

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    location: formData.get("location") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    published: formData.get("published") === "on",
  });
  if (!parsed.success) redirect("/events?error=1");

  const data = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    location: parsed.data.location || null,
    imageUrl: parsed.data.imageUrl || null,
    published: parsed.data.published,
    startsAt: startsAt!,
    endsAt,
  };

  if (id) {
    await prisma.event.updateMany({ where: { id, schoolId: school.id }, data });
  } else {
    await prisma.event.create({ data: { ...data, schoolId: school.id } });
  }

  revalidatePath("/events");
  redirect("/events");
}

export async function deleteEvent(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");
  await prisma.event.deleteMany({ where: { id, schoolId: school.id } });
  revalidatePath("/events");
  redirect("/events");
}
