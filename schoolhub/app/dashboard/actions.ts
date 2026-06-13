"use server";

import { redirect } from "next/navigation";
import {
  destroySession,
  getSession,
} from "@/lib/auth";
import {
  clearActiveSchoolCookie,
  setActiveSchoolCookie,
} from "@/lib/context";
import { prisma } from "@/lib/db";

export async function logout() {
  destroySession();
  clearActiveSchoolCookie();
  redirect("/login");
}

/** Superadmin picks which school to manage. */
export async function setActiveSchool(formData: FormData) {
  const session = await getSession();
  if (session?.role !== "SUPERADMIN") redirect("/login");

  const schoolId = String(formData.get("schoolId") || "");
  const exists = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!exists) redirect("/select-school");

  setActiveSchoolCookie(schoolId);
  redirect("/");
}

/** Superadmin returns to the school picker. */
export async function switchSchool() {
  clearActiveSchoolCookie();
  redirect("/select-school");
}
