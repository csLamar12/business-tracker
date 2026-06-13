import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The platform root domain (dev: anchorpointja.com, prod: schoolhubja.com).
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "anchorpointja.com")
  .replace(/^https?:\/\//, "")
  .replace(/:\d+$/, "");

export const config = {
  // Run on every request except Next internals, the API, and files with an
  // extension (e.g. favicon.ico, images). Tenant page paths have no dot.
  matcher: ["/((?!api/|_next/|_static/|_vercel|favicon.ico|.*\\..*).*)"],
};

export default function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const path = url.pathname + url.search;

  // Host without port.
  const rawHost = req.headers.get("host") || "";
  const host = rawHost.replace(/:\d+$/, "").toLowerCase();

  // Support local development: "localhost" is the root, "<sub>.localhost" a tenant.
  const isLocal =
    host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.0.0.1");
  const baseDomain = isLocal ? "localhost" : ROOT_DOMAIN;

  // Figure out which "tenant key" (if any) this request targets.
  // subdomain  -> the label before the base domain ("kingston-college")
  // customHost -> a full external domain that isn't us ("www.kc.edu.jm")
  let subdomain: string | null = null;
  let customHost: string | null = null;

  if (host === baseDomain || host === `www.${baseDomain}` || host.startsWith("127.0.0.1")) {
    // root marketing site — fall through
  } else if (host.endsWith(`.${baseDomain}`)) {
    subdomain = host.slice(0, host.length - baseDomain.length - 1);
  } else {
    customHost = host;
  }

  // The admin dashboard lives on the reserved "app" subdomain.
  if (subdomain === "app") {
    return NextResponse.rewrite(new URL(`/dashboard${url.pathname === "/" ? "" : url.pathname}${url.search}`, req.url));
  }

  // Premium custom domain -> resolve to that school's site by full host.
  if (customHost) {
    return NextResponse.rewrite(new URL(`/s/${encodeURIComponent(customHost)}${path}`, req.url));
  }

  // Reserved platform subdomains that should still serve the marketing site.
  const RESERVED = new Set(["www", "", "admin", "api", "mail", "static", "assets"]);

  // Tenant subdomain -> that school's site.
  if (subdomain && !RESERVED.has(subdomain)) {
    return NextResponse.rewrite(new URL(`/s/${encodeURIComponent(subdomain)}${path}`, req.url));
  }

  // Root domain -> marketing site (served by the (marketing) route group).
  return NextResponse.next();
}
