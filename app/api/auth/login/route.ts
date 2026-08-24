import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authService, AuthError } from "@/lib/authService";
import { setAuthCookies } from "@/lib/auth";
import { upsertUserOnLogin, toPublicUser } from "@/lib/repositories/users";
import { originOk, jsonError } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid email or password");
  try {
    const res = await authService.login(parsed.data.email, parsed.data.password);
    const user = await upsertUserOnLogin(res.user.id, res.user.email);
    await setAuthCookies(res.access_token, res.refresh_token);
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 0) return jsonError(503, "Auth service unavailable");
      if (e.status === 401) return jsonError(401, "Invalid email or password");
      return jsonError(e.status, e.message);
    }
    return jsonError(500, "Login failed");
  }
}
