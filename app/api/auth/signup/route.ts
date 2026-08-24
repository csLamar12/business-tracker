import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authService, AuthError } from "@/lib/authService";
import { setAuthCookies } from "@/lib/auth";
import { upsertUserOnLogin, toPublicUser } from "@/lib/repositories/users";
import { ensureIndexes } from "@/lib/db";
import { originOk, jsonError } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message || "Invalid input");
  }
  try {
    await ensureIndexes(); // first-ever write path — make sure unique indexes exist
    const res = await authService.signup(parsed.data.email, parsed.data.password);
    const user = await upsertUserOnLogin(res.user.id, res.user.email);
    await setAuthCookies(res.access_token, res.refresh_token);
    return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 0) return jsonError(503, "Auth service unavailable");
      return jsonError(e.status || 400, e.message);
    }
    return jsonError(500, "Signup failed");
  }
}
