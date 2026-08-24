import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authService, AuthError } from "@/lib/authService";
import { originOk, jsonError } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message || "Invalid input");
  }
  const { email, code, new_password } = parsed.data;
  try {
    await authService.resetPassword(email, code, new_password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 0) return jsonError(503, "Auth service unavailable");
      return jsonError(e.status || 400, e.message || "Invalid or expired code");
    }
    return jsonError(500, "Reset failed");
  }
}
