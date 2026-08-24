import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { acceptInvite, declineInvite } from "@/lib/repositories/invites";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ action: z.enum(["accept", "decline"]) });

export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid action");
  const ok =
    parsed.data.action === "accept"
      ? await acceptInvite(id, ctx.sub)
      : await declineInvite(id, ctx.sub);
  if (!ok) return jsonError(400, "Invite not found or already handled");
  return NextResponse.json({ ok: true });
}
