import { NextRequest, NextResponse } from "next/server";
import { requireMutation, isResponse } from "@/lib/http";
import { touchPresence } from "@/lib/repositories/users";

export const runtime = "nodejs";

// Heartbeat — the client pings this on an interval + on tab focus.
export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  await touchPresence(ctx.sub);
  return NextResponse.json({ ok: true });
}
