import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { getUser, setSuspended } from "@/lib/repositories/users";
import { recordEvent } from "@/lib/repositories/events";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ suspended: z.boolean() });

// Admin-only: put an account into read-only mode, or restore it.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  if (!ctx.isAdmin) return jsonError(403, "Admins only");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");
  const { id } = await params;

  // Refuse self-suspension: an admin locking themselves out of every mutating
  // route would have no way back in from the UI.
  if (id === ctx.sub) return jsonError(400, "You can't suspend your own account.");

  const user = await getUser(id);
  if (!user) return jsonError(404, "No such user");

  await setSuspended(id, parsed.data.suspended);
  await recordEvent(
    ctx.sub,
    parsed.data.suspended ? "suspended" : "restored",
    user.displayName,
  );
  return NextResponse.json({ ok: true, suspended: parsed.data.suspended });
}
