import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSession, type SessionPayload } from "./auth";

const ACTIVE_SCHOOL_COOKIE = "sh_active_school";

/**
 * The school the current admin is managing.
 *
 * - A SCHOOL_ADMIN / EDITOR is bound to exactly one school (session.schoolId).
 * - A SUPERADMIN has no school of their own; they pick one to manage, which is
 *   remembered in the `sh_active_school` cookie.
 */
export async function getActiveSchool() {
  const session = await getSession();
  if (!session) return null;

  let schoolId = session.schoolId;
  if (!schoolId) {
    schoolId = (await cookies()).get(ACTIVE_SCHOOL_COOKIE)?.value ?? null;
  }
  if (!schoolId) return null;

  return prisma.school.findUnique({ where: { id: schoolId } });
}

/** Guard for content-management pages: ensures a school is in context. */
export async function requireActiveSchool() {
  const school = await getActiveSchool();
  if (!school) redirect("/select-school");
  return school;
}

export async function setActiveSchoolCookie(schoolId: string) {
  (await cookies()).set(ACTIVE_SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearActiveSchoolCookie() {
  (await cookies()).delete(ACTIVE_SCHOOL_COOKIE);
}

export function isSuperadmin(session: SessionPayload | null): boolean {
  return session?.role === "SUPERADMIN";
}
