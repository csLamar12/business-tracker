"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function requireSuperadmin() {
  const session = await getSession();
  if (session?.role !== "SUPERADMIN") redirect("/");
}

export async function toggleHandled(formData: FormData) {
  await requireSuperadmin();
  const id = String(formData.get("id") || "");
  const handled = formData.get("handled") === "true";
  await prisma.contactMessage.update({
    where: { id },
    data: { handled: !handled },
  });
  revalidatePath("/messages");
  redirect("/messages");
}

export async function deleteMessage(formData: FormData) {
  await requireSuperadmin();
  const id = String(formData.get("id") || "");
  await prisma.contactMessage.delete({ where: { id } });
  revalidatePath("/messages");
  redirect("/messages");
}
