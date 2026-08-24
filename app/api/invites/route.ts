import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import { getBusiness, rootBusinessId } from "@/lib/repositories/businesses";
import { createInvite, listIncomingInvites } from "@/lib/repositories/invites";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ invites: await listIncomingInvites(ctx.sub) });
}

const schema = z.object({
  businessId: z.string().min(1),
  inviteeId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");
  // Only the owner (or admin) may share a business.
  const rootId = await rootBusinessId(parsed.data.businessId);
  if (!rootId) return jsonError(404, "No such business");
  const root = await getBusiness(rootId);
  if (!root) return jsonError(404, "No such business");
  if (root.ownerId !== ctx.sub && !ctx.isAdmin) {
    return jsonError(403, "Only the owner can share");
  }
  const res = await createInvite(rootId, ctx.sub, parsed.data.inviteeId);
  if (!res.ok) return jsonError(409, res.error || "Could not invite");
  return NextResponse.json({ ok: true });
}
