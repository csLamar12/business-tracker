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
  introHtml: z.string().trim().max(8000).optional().or(z.literal("")),
  requirementsHtml: z.string().trim().max(8000).optional().or(z.literal("")),
  processHtml: z.string().trim().max(8000).optional().or(z.literal("")),
  feesHtml: z.string().trim().max(8000).optional().or(z.literal("")),
  applyUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export async function saveAdmissions(formData: FormData) {
  const school = await requireActiveSchool();

  const parsed = schema.safeParse({
    introHtml: formData.get("introHtml") || undefined,
    requirementsHtml: formData.get("requirementsHtml") || undefined,
    processHtml: formData.get("processHtml") || undefined,
    feesHtml: formData.get("feesHtml") || undefined,
    applyUrl: formData.get("applyUrl") || undefined,
  });
  if (!parsed.success) redirect("/admissions?error=1");

  const data = {
    introHtml: parsed.data.introHtml || null,
    requirementsHtml: parsed.data.requirementsHtml || null,
    processHtml: parsed.data.processHtml || null,
    feesHtml: parsed.data.feesHtml || null,
    applyUrl: parsed.data.applyUrl || null,
    opensOn: toDate(formData.get("opensOn")),
    closesOn: toDate(formData.get("closesOn")),
  };

  await prisma.admissionsInfo.upsert({
    where: { schoolId: school.id },
    create: { ...data, schoolId: school.id },
    update: data,
  });

  revalidatePath("/admissions");
  redirect("/admissions?saved=1");
}
