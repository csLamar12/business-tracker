"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireActiveSchool } from "@/lib/context";

async function setApproval(formData: FormData, approved: boolean) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");
  await prisma.alumniProfile.updateMany({
    where: { id, schoolId: school.id },
    data: { approved },
  });
  revalidatePath("/alumni");
  redirect("/alumni");
}

export async function approveAlumni(formData: FormData) {
  await setApproval(formData, true);
}

export async function unapproveAlumni(formData: FormData) {
  await setApproval(formData, false);
}

export async function deleteAlumni(formData: FormData) {
  const school = await requireActiveSchool();
  const id = String(formData.get("id") || "");
  await prisma.alumniProfile.deleteMany({ where: { id, schoolId: school.id } });
  revalidatePath("/alumni");
  redirect("/alumni");
}
