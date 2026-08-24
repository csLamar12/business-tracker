import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import { getFxRate, setFxRate } from "@/lib/repositories/settings";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ fxRate: await getFxRate() });
}

const schema = z.object({ fxRate: z.number().positive() });

export async function PATCH(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Rate must be a positive number");
  await setFxRate(parsed.data.fxRate);
  return NextResponse.json({ ok: true });
}
