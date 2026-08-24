import { NextRequest, NextResponse } from "next/server";
import { readAuthCookies, setAuthCookies, clearAuthCookies } from "@/lib/auth";
import { refreshTokens } from "@/lib/refresh";
import { AuthError } from "@/lib/authService";
import { originOk, jsonError } from "@/lib/http";

export const runtime = "nodejs";

function safeNext(raw: string | null): string {
  // Only same-site relative paths; never an open redirect.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

// GET: middleware redirects here when the access token is expired.
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const { refresh } = await readAuthCookies();
  if (!refresh) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    const { access, refresh: rotated } = await refreshTokens(refresh);
    await setAuthCookies(access, rotated); // WRITE BACK the rotated refresh
    return NextResponse.redirect(new URL(next, req.url));
  } catch (e) {
    if (e instanceof AuthError && [401, 403, 422].includes(e.status)) {
      await clearAuthCookies();
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

// POST: programmatic refresh (client fetch wrapper on a 401).
export async function POST(req: NextRequest) {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  const { refresh } = await readAuthCookies();
  if (!refresh) return jsonError(401, "No session");
  try {
    const { access, refresh: rotated } = await refreshTokens(refresh);
    await setAuthCookies(access, rotated);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      if ([401, 403, 422].includes(e.status)) {
        await clearAuthCookies();
        return jsonError(401, "Session expired");
      }
      return jsonError(503, "Auth service unavailable"); // keep cookies
    }
    return jsonError(500, "Refresh failed");
  }
}
