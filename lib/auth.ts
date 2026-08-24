import { cookies } from "next/headers";
import { verifyAccessToken } from "./verify";
import type { Session } from "./types";

export { verifyAccessToken, isExpired } from "./verify";

export const AT_COOKIE = "bt_at";
export const RT_COOKIE = "bt_rt";
const RT_PATH = "/api/auth";
const WEEK = 60 * 60 * 24 * 7;

const isProd = () => process.env.NODE_ENV === "production";

export async function setAuthCookies(access: string, refresh?: string) {
  const store = await cookies();
  store.set(AT_COOKIE, access, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: WEEK, // outlives the 15m token so middleware can detect expiry→refresh
  });
  if (refresh) {
    store.set(RT_COOKIE, refresh, {
      httpOnly: true,
      secure: isProd(),
      sameSite: "strict",
      path: RT_PATH, // long-lived token only ever sent to the refresh/logout routes
      maxAge: WEEK,
    });
  }
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.set(AT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  store.set(RT_COOKIE, "", { httpOnly: true, path: RT_PATH, maxAge: 0 });
}

export async function readAuthCookies(): Promise<{
  access?: string;
  refresh?: string;
}> {
  const store = await cookies();
  return {
    access: store.get(AT_COOKIE)?.value,
    refresh: store.get(RT_COOKIE)?.value,
  };
}

/** Session from the access cookie, or null. For server components + handlers. */
export async function getSession(): Promise<Session | null> {
  const { access } = await readAuthCookies();
  return verifyAccessToken(access);
}
