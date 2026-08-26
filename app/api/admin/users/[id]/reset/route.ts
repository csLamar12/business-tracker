import { NextRequest, NextResponse } from "next/server";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { authService } from "@/lib/authService";
import { getUser } from "@/lib/repositories/users";
import { recordEvent } from "@/lib/repositories/events";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Admin-triggered password reset: emails the user a code to set a new password.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  if (!ctx.isAdmin) return jsonError(403, "Admins only");
  const { id } = await params;
  const user = await getUser(id);
  if (!user) return jsonError(404, "No such user");
  try {
    await authService.forgotPassword(user.email);
  } catch {
    return jsonError(503, "Could not send the reset email");
  }
  await recordEvent(ctx.sub, "reset password for", user.email);
  return NextResponse.json({ ok: true });
}
