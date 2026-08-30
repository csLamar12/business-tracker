import { NextRequest, NextResponse } from "next/server";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { hasAccess } from "@/lib/repositories/businesses";
import { getRecurrence, stopRecurrence } from "@/lib/repositories/recurrences";
import { recordEvent } from "@/lib/repositories/events";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Stop a repeating rule. Occurrences it already produced stay put — they are
// records of money that moved (or was scheduled), not part of the rule.
export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  const rule = await getRecurrence(id);
  if (!rule) return NextResponse.json({ ok: true });
  if (!(await hasAccess(rule.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  await stopRecurrence(id);
  await recordEvent(ctx.sub, `stopped recurring ${rule.type}`, rule.label, rule.businessId);
  return NextResponse.json({ ok: true });
}
