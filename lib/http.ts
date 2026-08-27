import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./auth";
import { getUser } from "./repositories/users";
import type { Session } from "./types";

export interface Ctx {
  sub: string;
  isAdmin: boolean;
  /** Read-only account: may view, but not change data. */
  suspended: boolean;
}

export const SUSPENDED_MESSAGE =
  "Your account is read-only. An admin suspended it — you can still view everything, and delete businesses you own.";

/** Authenticated caller context (with tracker-side isAdmin), or a 401. */
export async function requireUser(): Promise<Ctx | NextResponse> {
  const s = await getSession();
  if (!s) return jsonError(401, "Not authenticated");
  const u = await getUser(s.sub);
  if (!u) return jsonError(401, "No profile");
  return { sub: s.sub, isAdmin: u.isAdmin, suspended: !!u.suspended };
}

/**
 * Same-origin + authenticated context for mutating routes, or a 401/403.
 *
 * Suspended (read-only) accounts are rejected here, which is the single
 * chokepoint every mutating route already passes through. `allowSuspended` opts
 * a route out, and is reserved for actions a read-only user must still perform:
 * deleting their own businesses (the way they become deletable), the presence
 * heartbeat, and marking notifications seen — blocking those would spam 403s
 * and strand them, without protecting any data.
 */
export async function requireMutation(
  req: NextRequest,
  opts: { allowSuspended?: boolean } = {},
): Promise<Ctx | NextResponse> {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  if (ctx.suspended && !opts.allowSuspended) {
    return jsonError(403, SUSPENDED_MESSAGE);
  }
  return ctx;
}

/** CSRF: allow same-origin (+ an optional allowlist), reject cross-site. */
export function originOk(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // no Origin (same-origin nav / server) — SameSite covers this
  // Same-origin: the Origin header's host matches the host we were requested on.
  // Works on the Railway domain, the custom domain, and localhost alike.
  const host = req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return true;
  } catch {
    return false;
  }
  // Fallback: an explicitly allow-listed origin (comma-separated APP_ORIGIN).
  const allowed = (process.env.APP_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin);
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
