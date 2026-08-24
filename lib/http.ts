import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./auth";
import { getUser } from "./repositories/users";
import type { Session } from "./types";

export interface Ctx {
  sub: string;
  isAdmin: boolean;
}

/** Authenticated caller context (with tracker-side isAdmin), or a 401. */
export async function requireUser(): Promise<Ctx | NextResponse> {
  const s = await getSession();
  if (!s) return jsonError(401, "Not authenticated");
  const u = await getUser(s.sub);
  if (!u) return jsonError(401, "No profile");
  return { sub: s.sub, isAdmin: u.isAdmin };
}

/** Same-origin + authenticated context for mutating routes, or a 401/403. */
export async function requireMutation(req: NextRequest): Promise<Ctx | NextResponse> {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  return requireUser();
}

/** CSRF: reject cross-site mutating requests via an Origin allowlist. */
export function originOk(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // no Origin (same-origin nav / server) — SameSite covers this
  const allowed = process.env.APP_ORIGIN || "http://localhost:3000";
  return origin === allowed;
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Session or a 401 Response. Use at the top of protected route handlers. */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return jsonError(401, "Not authenticated");
  return session;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

/** Guard mutating routes: same-origin + authenticated. Returns Session or a Response. */
export async function guardMutation(
  req: NextRequest,
): Promise<Session | NextResponse> {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  return requireSession();
}
