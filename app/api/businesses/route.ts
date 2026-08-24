import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import {
  listTopLevelFor,
  listSubsidiaries,
  createBusiness,
  hasAccess,
} from "@/lib/repositories/businesses";
import { ensureIndexes } from "@/lib/db";
import { recordEvent } from "@/lib/repositories/events";
import type { Business } from "@/lib/types";

export const runtime = "nodejs";

// Sidebar: top-level businesses the user can see, each with its subsidiaries.
export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const tops = await listTopLevelFor(ctx.sub, ctx.isAdmin);
  const withSubs: { business: Business; subs: Business[] }[] = [];
  for (const b of tops) {
    withSubs.push({ business: b, subs: await listSubsidiaries(b._id) });
  }
  return NextResponse.json({ businesses: withSubs });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Name required");
  await ensureIndexes();
  const { name, parentId } = parsed.data;
  // Adding a subsidiary requires access to the parent.
  if (parentId && !(await hasAccess(parentId, ctx.sub, ctx.isAdmin))) {
    return jsonError(403, "No access to that business");
  }
  const biz = await createBusiness(name, parentId ?? null, ctx.sub);
  await recordEvent(ctx.sub, parentId ? "added subsidiary" : "created business", biz.name, biz._id);
  return NextResponse.json({ business: biz }, { status: 201 });
}
