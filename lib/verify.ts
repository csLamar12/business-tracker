// Pure token verification — jose only, NO next/headers import, so it is safe to
// use from middleware (edge runtime) as well as route handlers.
import { importSPKI, jwtVerify, type CryptoKey } from "jose";
import type { Session } from "./types";

let _keyPromise: Promise<CryptoKey> | null = null;

function publicKey(): Promise<CryptoKey> {
  if (!_keyPromise) {
    const pem = (process.env.AUTH_JWT_PUBLIC_KEY || "").replace(/\\n/g, "\n");
    if (!pem.includes("BEGIN")) {
      throw new Error("AUTH_JWT_PUBLIC_KEY is missing or malformed");
    }
    _keyPromise = importSPKI(pem, "RS256") as Promise<CryptoKey>;
  }
  return _keyPromise;
}

const audience = () => process.env.AUTH_AUDIENCE || "tracker";

/**
 * Verify an anchor-auth access token: pin RS256 (alg-confusion defense),
 * enforce aud === app id, and reject a refresh token used as access (both share
 * the signing key). Returns null on any failure.
 */
export async function verifyAccessToken(
  token: string | undefined | null,
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await publicKey(), {
      algorithms: ["RS256"],
      audience: audience(),
    });
    if (payload.type !== "access") return null;
    if (!payload.sub) return null;
    return { sub: payload.sub, role: String(payload.role ?? "user") };
  } catch {
    return null;
  }
}

/** True only when a token is present but EXPIRED (→ caller should refresh). */
export async function isExpired(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, await publicKey(), {
      algorithms: ["RS256"],
      audience: audience(),
    });
    return false;
  } catch (e) {
    return (e as { code?: string })?.code === "ERR_JWT_EXPIRED";
  }
}
