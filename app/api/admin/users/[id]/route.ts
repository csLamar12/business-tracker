import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { readAuthCookies } from "@/lib/auth";
import { authService, AuthError } from "@/lib/authService";
import { getUser, purgeUserData } from "@/lib/repositories/users";
import { listOwnedBusinesses } from "@/lib/repositories/businesses";
import { recordEvent } from "@/lib/repositories/events";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// The typed email is the confirmation — it must match the target exactly.
const schema = z.object({ email: z.string().min(1) });

/**
 * Admin-only: permanently delete a user, from anchor-auth and the tracker.
 *
 * Blocked while the user still OWNS businesses: deleting an account must never
 * destroy financial records as a side effect. They clear their own businesses
 * (a read-only account can still do that) or delete themselves, and then this
 * succeeds. Their past transactions and plans are kept either way — those
 * belong to the business, not the author.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  if (!ctx.isAdmin) return jsonError(403, "Admins only");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Type the account's email to confirm");
  const { id } = await params;

  if (id === ctx.sub) {
    return jsonError(400, "You can't delete your own account here.");
  }
  const user = await getUser(id);
  if (!user) return jsonError(404, "No such user");

  // Compare trimmed on BOTH sides, and require both to be non-empty: min(1) is
  // checked before trimming, so " " would otherwise confirm the deletion of an
  // account that has no stored email.
  const typed = parsed.data.email.trim().toLowerCase();
  const actual = (user.email || "").trim().toLowerCase();
  if (!typed || !actual || typed !== actual) {
    return jsonError(400, "That email doesn't match this account.");
  }

  const owned = await listOwnedBusinesses(id);
  if (owned.length) {
    const names = owned.map((b) => b.name).join(", ");
    return jsonError(
      409,
      `${user.displayName} still owns ${owned.length} business${owned.length === 1 ? "" : "es"} (${names}). ` +
        `They must delete these first — suspend the account to read-only if you need to stop other changes meanwhile.`,
    );
  }

  // Delete the auth account FIRST. If it fails we've touched nothing; the
  // reverse order could strip their tracker data and leave a working login.
  const { access } = await readAuthCookies();
  if (!access) return jsonError(401, "Not authenticated");
  try {
    await authService.adminDeleteUser(user.email, access);
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 0) return jsonError(503, "Auth service unavailable");
      if (e.status === 403) {
        return jsonError(
          403,
          "anchor-auth refused the delete — add your email to ANCHOR_AUTH_OPS_EMAILS on the auth service.",
        );
      }
      // 404 there just means the auth side is already gone; fall through and
      // finish cleaning up this side rather than stranding the tracker row.
      if (e.status !== 404) return jsonError(e.status || 400, e.message || "Delete failed");
    } else {
      return jsonError(500, "Delete failed");
    }
  }

  // The auth account is gone by this point, so the deletion HAS happened. Record
  // it before cleanup and never let a cleanup failure surface as a bare 500 that
  // implies nothing occurred — the admin needs to know the sign-in is dead and
  // some tracker rows may linger.
  await recordEvent(ctx.sub, "deleted user", user.email);
  try {
    await purgeUserData(id);
  } catch (e) {
    console.error("[admin] purgeUserData failed after auth delete:", (e as Error).message);
    return jsonError(
      500,
      "Sign-in deleted, but clearing their tracker data failed. Retry the delete to finish cleanup.",
    );
  }
  return NextResponse.json({ ok: true });
}
