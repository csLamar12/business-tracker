"use server";

import { redirect } from "next/navigation";
import { createSession, verifyCredentials } from "@/lib/auth";
import { setActiveSchoolCookie } from "@/lib/context";
import type { Role } from "@/lib/constants";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const user = await verifyCredentials(email, password);
  if (!user) {
    redirect("/login?error=1");
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    schoolId: user.schoolId,
  });

  // School admins go straight to their school; superadmins pick one.
  if (user.schoolId) {
    setActiveSchoolCookie(user.schoolId);
    redirect("/");
  }
  redirect("/select-school");
}
