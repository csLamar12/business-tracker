import { NextRequest, NextResponse } from "next/server";
import { requireUser, isResponse, jsonError } from "@/lib/http";
import { distinctValues } from "@/lib/repositories/transactions";

export const runtime = "nodejs";

// Autocomplete "memory": distinct Source/Category and Notes values the user has
// used before (across their businesses), most-used first.
export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const type = req.nextUrl.searchParams.get("type");
  if (type !== "income" && type !== "expense") return jsonError(400, "type required");
  const [labels, notes] = await Promise.all([
    distinctValues(ctx.sub, ctx.isAdmin, type, "label"),
    distinctValues(ctx.sub, ctx.isAdmin, type, "notes"),
  ]);
  return NextResponse.json({ labels, notes });
}
