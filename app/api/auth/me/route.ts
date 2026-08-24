import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUser, toPublicUser } from "@/lib/repositories/users";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const user = await getUser(session.sub);
  if (!user) return NextResponse.json({ error: "No profile" }, { status: 404 });
  return NextResponse.json({ user: toPublicUser(user) });
}
