import { NextRequest, NextResponse } from "next/server";
import { requireMutation, isResponse } from "@/lib/http";
import { touchPresence } from "@/lib/repositories/users";

export const runtime = "nodejs";

// Heartbeat — the client pings this on an interval + on tab focus.
export async function POST(req: NextRequest) {
  // Heartbeat, not a content change — a read-only user still shows as online.
  const ctx = await requireMutation(req, { allowSuspended: true });
  if (isResponse(ctx)) return ctx;
  await touchPresence(ctx.sub);
  return NextResponse.json({ ok: true });
}
