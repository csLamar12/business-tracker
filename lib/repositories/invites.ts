import { col, toObjectId, type InviteDoc } from "@/lib/db";
import type { Invite } from "@/lib/types";
import {
  rootBusinessId,
  hasAccess,
  addMember,
  getBusiness,
} from "./businesses";
import { getUser } from "./users";
import { enqueueNotification } from "./notifications";
import { sendEmail } from "@/lib/mail";

function toInvite(d: InviteDoc, businessName?: string): Invite {
  return {
    _id: d._id.toHexString(),
    businessId: d.businessId.toHexString(),
    inviterId: d.inviterId,
    inviteeId: d.inviteeId,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
    businessName,
  };
}

export async function createInvite(
  businessId: string,
  inviterSub: string,
  inviteeSub: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!inviteeSub || inviteeSub === inviterSub) return { ok: false, error: "Invalid invitee" };
  const rootId = await rootBusinessId(businessId);
  if (!rootId) return { ok: false, error: "No such business" };
  const rootOid = toObjectId(rootId)!;
  if (await hasAccess(rootId, inviteeSub)) return { ok: false, error: "Already has access" };

  const invites = await col.invites();
  const existing = await invites.findOne({
    businessId: rootOid,
    inviteeId: inviteeSub,
    status: "pending",
  });
  if (!existing) {
    await invites.insertOne({
      businessId: rootOid,
      inviterId: inviterSub,
      inviteeId: inviteeSub,
      status: "pending",
      createdAt: new Date(),
      resolvedAt: null,
    } as InviteDoc);
  }
  // notify + email the invitee (best-effort)
  const biz = await getBusiness(rootId);
  const inviter = await getUser(inviterSub);
  const invitee = await getUser(inviteeSub);
  const bizName = biz?.name ?? "a business";
  await enqueueNotification({
    recipientId: inviteeSub,
    kind: "invite",
    title: `${inviter?.displayName ?? "Someone"} invited you to ${bizName}`,
    body: `Open the bell to accept access to “${bizName}”.`,
    businessId: rootId,
    createdById: inviterSub,
  });
  if (invitee?.email) {
    await sendEmail(
      invitee.email,
      `[Business Tracker] ${inviter?.displayName ?? "Someone"} shared ${bizName} with you`,
      `You have been invited to access “${bizName}” in Business Tracker.\n\nOpen the app and click the bell to accept.`,
    );
  }
  return { ok: true };
}

export async function listPendingInvitees(businessId: string): Promise<string[]> {
  const rootId = await rootBusinessId(businessId);
  if (!rootId) return [];
  const rootOid = toObjectId(rootId)!;
  const docs = await (await col.invites())
    .find({ businessId: rootOid, status: "pending" })
    .toArray();
  return docs.map((d) => d.inviteeId);
}

export async function listIncomingInvites(sub: string): Promise<Invite[]> {
  const docs = await (await col.invites())
    .find({ inviteeId: sub, status: "pending" })
    .sort({ _id: -1 })
    .toArray();
  const out: Invite[] = [];
  for (const d of docs) {
    const biz = await getBusiness(d.businessId.toHexString());
    out.push(toInvite(d, biz?.name));
  }
  return out;
}

export async function countIncomingInvites(sub: string): Promise<number> {
  return (await col.invites()).countDocuments({ inviteeId: sub, status: "pending" });
}

export async function acceptInvite(inviteId: string, sub: string): Promise<boolean> {
  const oid = toObjectId(inviteId);
  if (!oid) return false;
  const invites = await col.invites();
  const inv = await invites.findOne({ _id: oid });
  if (!inv || inv.inviteeId !== sub || inv.status !== "pending") return false;
  await invites.updateOne(
    { _id: oid },
    { $set: { status: "accepted", resolvedAt: new Date() } },
  );
  await addMember(inv.businessId.toHexString(), sub);
  const biz = await getBusiness(inv.businessId.toHexString());
  const invitee = await getUser(sub);
  await enqueueNotification({
    recipientId: inv.inviterId,
    kind: "invite_accepted",
    title: `${invitee?.displayName ?? "Someone"} accepted your invite`,
    body: `They now have access to “${biz?.name ?? "a business"}”.`,
    businessId: inv.businessId.toHexString(),
    createdById: sub,
  });
  return true;
}

export async function declineInvite(inviteId: string, sub: string): Promise<boolean> {
  const oid = toObjectId(inviteId);
  if (!oid) return false;
  const invites = await col.invites();
  const inv = await invites.findOne({ _id: oid });
  if (!inv || inv.inviteeId !== sub || inv.status !== "pending") return false;
  await invites.updateOne(
    { _id: oid },
    { $set: { status: "declined", resolvedAt: new Date() } },
  );
  return true;
}
