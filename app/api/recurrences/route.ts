import { NextRequest, NextResponse } from "next/server";
import { requireUser, isResponse, jsonError } from "@/lib/http";
import { hasAccess } from "@/lib/repositories/businesses";
import { listRecurrences } from "@/lib/repositories/recurrences";

export const runtime = "nodejs";

// Active repeating rules for a business, so the tab can show what's scheduled
// and offer a way to stop it.
export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const businessId = req.nextUrl.searchParams.get("businessId") || "";
  const type = req.nextUrl.searchParams.get("type");
  if (type !== "income" && type !== "expense") return jsonError(400, "type required");
  if (!(await hasAccess(businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  return NextResponse.json({ recurrences: await listRecurrences(businessId, type) });
}
