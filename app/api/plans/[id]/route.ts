import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { hasAccess } from "@/lib/repositories/businesses";
import { getPlan, updatePlan, deletePlan } from "@/lib/repositories/plans";
import { processMentions } from "@/lib/repositories/mentions";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ field: z.string(), value: z.string() });

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) return jsonError(404, "Not found");
  if (!(await hasAccess(plan.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");
  const ok = await updatePlan(id, parsed.data.field, parsed.data.value);
  if (!ok) return jsonError(400, "Field not editable");
  if (parsed.data.field === "description") {
    await processMentions("plan", id, "description", parsed.data.value, plan.businessId, ctx.sub);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ ok: true });
  if (!(await hasAccess(plan.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  await deletePlan(id);
  return NextResponse.json({ ok: true });
}
