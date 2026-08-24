import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, isExpired } from "@/lib/verify";

// Next 16 "proxy" (formerly middleware). Gates every app route except public
// auth pages, Next internals, and /api (API routes enforce their own auth).
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|login|signup|forgot-password|reset-password|favicon.ico).*)",
  ],
};

export default async function proxy(req: NextRequest) {
  const token = req.cookies.get("bt_at")?.value;

  if (await verifyAccessToken(token)) {
    return NextResponse.next();
  }
  // Present but expired → silently refresh, then return to where they were.
  if (token && (await isExpired(token))) {
    const url = new URL("/api/auth/refresh", req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL("/login", req.url));
}
