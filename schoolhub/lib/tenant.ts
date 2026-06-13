import { cache } from "react";
import { prisma } from "./db";
import { normalizeDomain, ROOT_DOMAIN } from "./utils";

/**
 * Resolve a school from the value the middleware rewrote into the URL.
 *
 * The `[domain]` segment is either:
 *   - a subdomain label, e.g. "kingston-college"  (no dots), or
 *   - a full custom domain,  e.g. "www.kc.edu.jm"  (contains dots).
 *
 * Only published schools are returned for the public site. Wrapped in React's
 * `cache` so the layout and page share one query per request.
 */
export const getSchoolByDomainParam = cache(async function (param: string) {
  const value = decodeURIComponent(param).toLowerCase();

  if (value.includes(".")) {
    // Custom domain — try the exact host and the www/apex variant.
    const normalized = normalizeDomain(value);
    const variants = new Set([normalized]);
    if (normalized.startsWith("www.")) variants.add(normalized.slice(4));
    else variants.add(`www.${normalized}`);

    return prisma.school.findFirst({
      where: { published: true, customDomain: { in: Array.from(variants) } },
    });
  }

  return prisma.school.findFirst({
    where: { published: true, subdomain: value },
  });
});

/** The public URL for a school, honouring its plan (custom domain vs subdomain). */
export function schoolUrl(school: {
  subdomain: string;
  customDomain: string | null;
  plan: string;
}): string {
  if (school.plan === "PREMIUM" && school.customDomain) {
    return `https://${school.customDomain}`;
  }
  return `https://${school.subdomain}.${ROOT_DOMAIN}`;
}

/** The public URL during local development (http + localhost). */
export function schoolDevUrl(school: { subdomain: string }, port = 3000): string {
  return `http://${school.subdomain}.localhost:${port}`;
}
