import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import {
  listTopLevelFor,
  getBusiness,
  addMember,
  removeMember,
} from "@/lib/repositories/businesses";
import { listUsers, getUser, toPublicUser } from "@/lib/repositories/users";
import { recordEvent } from "@/lib/repositories/events";
import { enqueueNotification } from "@/lib/repositories/notifications";

export const runtime = "nodejs";

// Admin access matrix: every user × every top-level business, with owner/member
// state so the admin can see who can access what and grant/revoke access.
export async function GET() {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  if (!ctx.isAdmin) return jsonError(403, "Admins only");

  const [userDocs, roots] = await Promise.all([
    listUsers(),
    listTopLevelFor(ctx.sub, true), // admin sees all top-level businesses
  ]);
  const nameById = new Map(userDocs.map((u) => [u._id, u.displayName]));
  const users = userDocs.map(toPublicUser);
  const businesses = roots.map((b) => ({
    id: b._id,
    name: b.name,
    ownerId: b.ownerId,
    ownerName: b.ownerId ? nameById.get(b.ownerId) ?? "—" : "—",
    memberIds: b.memberIds,
  }));
  return NextResponse.json({ users, businesses });
}

const schema = z.object({
  businessId: z.string().min(1),
  userId: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  if (!ctx.isAdmin) return jsonError(403, "Admins only");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");
  const { businessId, userId, action } = parsed.data;

  const biz = await getBusiness(businessId);
  if (!biz || biz.parentId) return jsonError(404, "No such top-level business");
  const user = await getUser(userId);
  if (!user) return jsonError(404, "No such user");
  if (userId === biz.ownerId) {
    return jsonError(400, "That user owns this business — access can't be removed.");
  }

  if (action === "add") {
    await addMember(businessId, userId);
    await enqueueNotification({
      recipientId: userId,
      kind: "access_granted",
      title: `You were given access to ${biz.name}`,
      body: `An admin shared “${biz.name}” with you.`,
      businessId,
      createdById: ctx.sub,
    });
    await recordEvent(ctx.sub, "granted access to", user.displayName, businessId);
  } else {
    await removeMember(businessId, userId);
    await recordEvent(ctx.sub, "removed access for", user.displayName, businessId);
  }
  return NextResponse.json({ ok: true });
}
