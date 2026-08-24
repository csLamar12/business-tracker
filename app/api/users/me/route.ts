import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, guardMutation, isResponse, jsonError } from "@/lib/http";
import {
  getUser,
  toPublicUser,
  setDisplayName,
  setDisplayCurrency,
} from "@/lib/repositories/users";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const u = await getUser(session.sub);
  if (!u) return jsonError(404, "No profile");
  return NextResponse.json({ user: toPublicUser(u) });
}

const patchSchema = z.object({
  displayName: z.string().optional(),
  displayCurrency: z.enum(["USD", "JMD"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await guardMutation(req);
  if (isResponse(session)) return session;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");

  if (parsed.data.displayName !== undefined) {
    const r = await setDisplayName(session.sub, parsed.data.displayName);
    if (!r.ok) return jsonError(409, r.error || "Name unavailable");
  }
  if (parsed.data.displayCurrency) {
    await setDisplayCurrency(session.sub, parsed.data.displayCurrency);
  }
  const u = await getUser(session.sub);
  return NextResponse.json({ user: u ? toPublicUser(u) : null });
}
