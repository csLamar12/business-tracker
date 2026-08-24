import { NextResponse } from "next/server";
import { requireUser, isResponse } from "@/lib/http";
import { listUsers, toPublicUser } from "@/lib/repositories/users";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const users = await listUsers();
  return NextResponse.json({ users: users.map(toPublicUser) });
}
