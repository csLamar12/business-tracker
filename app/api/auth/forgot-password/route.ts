import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authService } from "@/lib/authService";
import { originOk, jsonError } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  if (!originOk(req)) return jsonError(403, "Bad origin");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid email");
  try {
    await authService.forgotPassword(parsed.data.email);
  } catch {
    // swallow — anti-enumeration: never reveal whether the email exists
  }
  return NextResponse.json({
    message: "If that email is registered, a reset code has been sent.",
  });
}
