import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { readAuthCookies } from "@/lib/auth";
import { authService, AuthError } from "@/lib/authService";
import { upsertUserOnLogin } from "@/lib/repositories/users";
import { recordEvent } from "@/lib/repositories/events";
import { ensureIndexes } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

// Admin creates an account for someone: register them in anchor-auth with a
// throwaway password (they never use it), then email them a code to set their
// own password. Consistent with the admin "reset password" flow.
export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  if (!ctx.isAdmin) return jsonError(403, "Admins only");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Valid email required");
  const email = parsed.data.email.toLowerCase();

  await ensureIndexes();
  // Meets anchor-auth's default policy (length + uppercase + digit).
  const tempPw = "Aa1" + randomBytes(18).toString("base64url");
  let existed = false;
  try {
    const res = await authService.signup(email, tempPw);
    await upsertUserOnLogin(res.user.id, res.user.email);
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 0) return jsonError(503, "Auth service unavailable");
      // 409 = already registered in anchor-auth. That happens when an earlier
      // attempt created the auth account but its code email never arrived,
      // which used to strand the address: re-creating failed, and with no
      // tracker user doc there was no row to "Reset password" from. Treat it as
      // a resend instead — forgot-password keys off the email alone, and the
      // tracker user doc is created by upsertUserOnLogin on their first login.
      if (e.status !== 409) {
        return jsonError(e.status || 400, e.message || "Could not create account");
      }
      existed = true;
    } else {
      return jsonError(500, "Create failed");
    }
  }
  // Send the ONBOARDING email (best-effort) — not the reset email. A brand-new
  // user has no password and never asked for a reset, so "password reset code"
  // reads as a mistake or a phishing attempt. Falls back to the reset email if
  // the auth service is older than /admin/send-welcome, so a deploy-order skew
  // still gets them a usable code.
  const { access } = await readAuthCookies();
  try {
    if (access) {
      await authService.sendWelcome(email, access);
    } else {
      await authService.forgotPassword(email);
    }
  } catch {
    try {
      await authService.forgotPassword(email);
    } catch {}
  }
  await recordEvent(ctx.sub, existed ? "resent set-password code" : "created user", email);
  return NextResponse.json({ ok: true, existed });
}
