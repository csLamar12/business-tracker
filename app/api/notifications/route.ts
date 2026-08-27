import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import {
  listUnseen,
  listRecent,
  markSeen,
} from "@/lib/repositories/notifications";
import { listIncomingInvites, countIncomingInvites } from "@/lib/repositories/invites";

export const runtime = "nodejs";

// Polled by the client: unseen (to toast), recent (bell list), incoming invites,
// and the badge count (pending invites).
export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const [unseen, recent, invites, badge] = await Promise.all([
    listUnseen(ctx.sub),
    listRecent(ctx.sub, 20),
    listIncomingInvites(ctx.sub),
    countIncomingInvites(ctx.sub),
  ]);
  return NextResponse.json({ unseen, recent, invites, badge });
}

const seenSchema = z.object({ ids: z.array(z.string()).max(200) });

export async function POST(req: NextRequest) {
  // Marking your own notifications seen is a read affordance; blocking it
  // would replay the same toasts forever.
  const ctx = await requireMutation(req, { allowSuspended: true });
  if (isResponse(ctx)) return ctx;
  const parsed = seenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");
  await markSeen(ctx.sub, parsed.data.ids);
  return NextResponse.json({ ok: true });
}
