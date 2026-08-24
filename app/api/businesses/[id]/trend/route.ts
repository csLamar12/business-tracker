import { NextRequest, NextResponse } from "next/server";
import { requireUser, isResponse, jsonError } from "@/lib/http";
import { hasAccess, monthlyTrend } from "@/lib/repositories/businesses";
import { getUser } from "@/lib/repositories/users";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  if (!(await hasAccess(id, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  const me = await getUser(ctx.sub);
  const display = me?.displayCurrency ?? "USD";
  return NextResponse.json({ trend: await monthlyTrend(id, display) });
}
