import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/lib/authService";
import { readAuthCookies, clearAuthCookies } from "@/lib/auth";
import { originOk, jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  const { access, refresh } = await readAuthCookies();
  if (access && refresh) {
    await authService.logout(access, refresh); // best-effort revoke
  }
  await clearAuthCookies();
  return NextResponse.json({ ok: true });
}
