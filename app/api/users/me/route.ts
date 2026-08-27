import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireMutation, isResponse, jsonError } from "@/lib/http";
import {
  getUser,
  toPublicUser,
  setDisplayName,
  setDisplayCurrency,
} from "@/lib/repositories/users";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const u = await getUser(session.sub);
  if (!u) return jsonError(404, "No profile");
  return NextResponse.json({ user: toPublicUser(u) });
}

const patchSchema = z.object({
  displayName: z.string().optional(),
  displayCurrency: z.enum(["USD", "JMD"]).optional(),
});

export async function PATCH(req: NextRequest) {
  // allowSuspended so a read-only user can still switch their display currency
  // — that's how they READ the numbers. Renaming is blocked below, since the
  // display name is what everyone else sees them as.
  const ctx = await requireMutation(req, { allowSuspended: true });
  if (isResponse(ctx)) return ctx;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");

  if (parsed.data.displayName !== undefined) {
    // A suspended user may still set their name the FIRST time. The app gates
    // every page behind /welcome until displayNameSet is true, so refusing here
    // would lock a read-only account out of the app entirely — the opposite of
    // "can view everything". Renaming afterwards stays blocked.
    const me = await getUser(ctx.sub);
    if (ctx.suspended && me?.displayNameSet) {
      return jsonError(403, "Your account is read-only.");
    }
    const r = await setDisplayName(ctx.sub, parsed.data.displayName);
    if (!r.ok) return jsonError(409, r.error || "Name unavailable");
  }
  if (parsed.data.displayCurrency) {
    await setDisplayCurrency(ctx.sub, parsed.data.displayCurrency);
  }
  const u = await getUser(ctx.sub);
  return NextResponse.json({ user: u ? toPublicUser(u) : null });
}
