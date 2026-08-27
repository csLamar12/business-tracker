// Server-side client for the anchor-auth standalone service.
// Runs only in Node route handlers — never import from client components.
//
// Endpoint rules (from anchor-auth server/anchor_auth/router.py):
//   X-App-Id REQUIRED on: /signup /login /forgot-password /verify-reset-code /reset-password
//   X-App-Id NOT sent on : /refresh /logout /me   (they key off the token)

const BASE = () => process.env.AUTH_SERVICE_URL || "http://localhost:8000";
const APP_ID = () => process.env.AUTH_APP_ID || "tracker";

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  [k: string]: unknown;
}
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}
export interface AccessTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(
  path: string,
  opts: { body?: unknown; bearer?: string; appId?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.appId) headers["X-App-Id"] = APP_ID();
  if (opts.bearer) headers["Authorization"] = `Bearer ${opts.bearer}`;

  let res: Response;
  try {
    res = await fetch(`${BASE()}/auth${path}`, {
      method: "POST",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    // Network/timeout — distinct from an auth rejection (callers must not treat
    // this as "logged out"; keep the session).
    throw new AuthError(0, `auth service unreachable: ${(e as Error).message}`);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || res.statusText || "auth error";
    const hint = res.redirected
      ? ` (request was redirected to ${res.url} — set AUTH_SERVICE_URL to the https:// URL with no trailing slash)`
      : "";
    throw new AuthError(res.status, String(detail) + hint);
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const authService = {
  signup: (email: string, password: string) =>
    call<TokenResponse>("/signup", { body: { email, password }, appId: true }),

  login: (email: string, password: string) =>
    call<TokenResponse>("/login", { body: { email, password }, appId: true }),

  refresh: (refreshToken: string) =>
    call<AccessTokenResponse>("/refresh", {
      body: { refresh_token: refreshToken },
    }),

  logout: async (accessToken: string, refreshToken: string) => {
    try {
      await call<null>("/logout", {
        body: { refresh_token: refreshToken },
        bearer: accessToken,
      });
    } catch {
      // logout is best-effort + idempotent; always clear cookies regardless.
    }
  },

  me: (accessToken: string) =>
    call<AuthUser>("/me", { bearer: accessToken }).catch(() => null),

  forgotPassword: (email: string) =>
    call<{ message: string }>("/forgot-password", {
      body: { email },
      appId: true,
    }),

  verifyResetCode: (email: string, code: string) =>
    call<{ message: string }>("/verify-reset-code", {
      body: { email, code },
      appId: true,
    }),

  // Ops-only delete of another account. Authorised by the acting admin's own
  // access token — anchor-auth checks their email against ANCHOR_AUTH_OPS_EMAILS,
  // so this can't be called with a service-wide secret.
  adminDeleteUser: (email: string, accessToken: string) =>
    call<{ deleted: boolean; email: string }>("/admin/delete-user", {
      body: { email },
      bearer: accessToken,
      appId: true,
    }),

  resetPassword: (email: string, code: string, newPassword: string) =>
    call<{ message: string }>("/reset-password", {
      body: { email, code, new_password: newPassword },
      appId: true,
    }),
};
