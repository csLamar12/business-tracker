import { NextResponse } from "next/server";
import { requireUser, isResponse } from "@/lib/http";
import { distinctDescriptions } from "@/lib/repositories/plans";

export const runtime = "nodejs";

// Autocomplete "memory": distinct plan descriptions the user has written before
// (across their businesses), most-used first.
export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const descriptions = await distinctDescriptions(ctx.sub, ctx.isAdmin);
  return NextResponse.json({ descriptions });
}
