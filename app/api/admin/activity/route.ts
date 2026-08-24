import { NextResponse } from "next/server";
import { requireUser, isResponse, jsonError } from "@/lib/http";
import { listTopLevelFor } from "@/lib/repositories/businesses";
import { getUser } from "@/lib/repositories/users";
import { listRecentEvents } from "@/lib/repositories/events";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  if (!ctx.isAdmin) return jsonError(403, "Admins only");

  const events = await listRecentEvents(50);
  const tops = await listTopLevelFor(ctx.sub, true);
  const businesses = [];
  for (const b of tops) {
    const owner = b.ownerId ? await getUser(b.ownerId) : null;
    businesses.push({
      id: b._id,
      name: b.name,
      owner: owner?.displayName ?? "—",
      members: b.memberIds.length,
    });
  }
  return NextResponse.json({ events, businesses });
}
