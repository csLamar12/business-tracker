import { authService } from "./authService";

// In-process single-flight so concurrent requests with the SAME refresh token
// don't each hit /auth/refresh — the first rotates+blacklists the jti, the rest
// would get "revoked" and falsely log the user out. One upstream call, shared.
// (Assumes a single tracker-web replica; scale-out would move this to Redis.)

export interface RefreshResult {
  access: string;
  refresh?: string;
}

const inflight = new Map<string, Promise<RefreshResult>>();

export function refreshTokens(rt: string): Promise<RefreshResult> {
  const existing = inflight.get(rt);
  if (existing) return existing;
  const p = (async () => {
    const res = await authService.refresh(rt);
    return { access: res.access_token, refresh: res.refresh_token };
  })();
  inflight.set(rt, p);
  return p.finally(() => inflight.delete(rt));
}
