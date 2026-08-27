import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import {
  getBusiness,
  hasAccess,
  rootBusinessId,
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
  // The one mutation a read-only account keeps: clearing the businesses it owns
  // is precisely what makes the account deletable.
  const ctx = await requireMutation(req, { allowSuspended: true });
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  if (!(await hasAccess(id, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  // Deleting removes the business, its subsidiaries, and EVERY transaction and
  // plan beneath them, so it is owner-only — deliberately narrower than
  // hasAccess, which admits members. A member may edit entries but must not be
  // able to wipe someone else's records, and this is also what makes the
  // "still owns businesses" block on account deletion mean anything.
  const rootId = await rootBusinessId(id);
  const root = rootId ? await getBusiness(rootId) : null;
  if (!root) return jsonError(404, "No such business");
  const isOwner = root.ownerId === ctx.sub;
  // A suspended owner keeps this power (it is how they become deletable), but a
  // suspended account never inherits the admin override.
  if (!isOwner && (ctx.suspended || !ctx.isAdmin)) {
    return jsonError(
      403,
      ctx.suspended
        ? "Read-only account: you can only delete businesses you own."
        : "Only the owner can delete this business.",
    );
  }
  await deleteBusiness(id);
  return NextResponse.json({ ok: true });
}
