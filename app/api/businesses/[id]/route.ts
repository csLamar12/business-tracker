import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import {
  getBusiness,
  hasAccess,
  renameBusiness,
  updatePhase,
  deleteBusiness,
  businessTotals,
  subsidiaryNet,
  listMembers,
} from "@/lib/repositories/businesses";
import { getUser, toPublicUser } from "@/lib/repositories/users";
import { getFxRate } from "@/lib/repositories/settings";
import { listPendingInvitees } from "@/lib/repositories/invites";
import { processMentions } from "@/lib/repositories/mentions";
import { PHASES } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  const biz = await getBusiness(id);
  if (!biz) return jsonError(404, "Not found");
  if (!(await hasAccess(id, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");

  const me = await getUser(ctx.sub);
  const display = me?.displayCurrency ?? "USD";
  const fxRate = await getFxRate();
  const { own, withSubs, subs } = await businessTotals(id, display);

  const subRows = [];
  for (const s of subs) {
    const t = await subsidiaryNet(s._id, display);
    subRows.push({ ...s, net: t.income - t.expenses });
  }

  const memberIds = await listMembers(id);
  const members = [];
  for (const mid of memberIds) {
    const u = await getUser(mid);
    if (u) members.push(toPublicUser(u));
  }

  const isOwner = biz.ownerId === ctx.sub;
  const pendingInvitees =
    isOwner || ctx.isAdmin ? await listPendingInvitees(id) : [];

  return NextResponse.json({
    business: biz,
    display,
    fxRate,
    isOwner,
    totals: { own, withSubs },
    subs: subRows,
    members,
    pendingInvitees,
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phase: z.enum(PHASES).optional(),
  phaseNotes: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  if (!(await hasAccess(id, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");

  if (parsed.data.name !== undefined) {
    await renameBusiness(id, parsed.data.name);
  }
  if (parsed.data.phase !== undefined || parsed.data.phaseNotes !== undefined) {
    const biz = await getBusiness(id);
    if (biz) {
      const phase = parsed.data.phase ?? biz.phase;
      const notes = parsed.data.phaseNotes ?? biz.phaseNotes;
      await updatePhase(id, phase, notes);
      if (parsed.data.phaseNotes !== undefined) {
        await processMentions("phase", id, "phaseNotes", notes, id, ctx.sub);
      }
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  if (!(await hasAccess(id, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  await deleteBusiness(id);
  return NextResponse.json({ ok: true });
}
