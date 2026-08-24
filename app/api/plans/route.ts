import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import { hasAccess } from "@/lib/repositories/businesses";
import { listPlans, addPlan } from "@/lib/repositories/plans";
import { processMentions } from "@/lib/repositories/mentions";
import { PLAN_STATUSES } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const businessId = req.nextUrl.searchParams.get("businessId") || "";
  if (!(await hasAccess(businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  return NextResponse.json({ plans: await listPlans(businessId) });
}

const createSchema = z.object({
  businessId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  targetDate: z.string().default(""),
  status: z.enum(PLAN_STATUSES).default(PLAN_STATUSES[0]),
});

export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message || "Invalid input");
  const d = parsed.data;
  if (!(await hasAccess(d.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  const plan = await addPlan({ ...d, createdBy: ctx.sub });
  await processMentions("plan", plan._id, "description", d.description, d.businessId, ctx.sub);
  return NextResponse.json({ plan }, { status: 201 });
}
