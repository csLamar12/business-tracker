"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveSchool } from "@/lib/context";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1),
  pinned: z.boolean(),
  published: z.boolean(),
});

export async function saveAnnouncement(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");

  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    pinned: formData.get("pinned") === "on",
    published: formData.get("published") === "on",
  });
  if (!parsed.success) redirect("/announcements?error=1");

  if (id) {
    await prisma.announcement.updateMany({
      where: { id, schoolId: school.id },
      data: parsed.data,
    });
  } else {
    await prisma.announcement.create({
      data: { ...parsed.data, schoolId: school.id },
    });
  }

  revalidatePath("/announcements");
  redirect("/announcements");
}

export async function deleteAnnouncement(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");
  await prisma.announcement.deleteMany({ where: { id, schoolId: school.id } });
  revalidatePath("/announcements");
  redirect("/announcements");
}
