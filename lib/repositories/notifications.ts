import { ObjectId } from "mongodb";
import { col, toObjectId, type NotificationDoc } from "@/lib/db";
import type { Notification, NotificationKind } from "@/lib/types";

function toNotif(d: NotificationDoc): Notification {
  return {
    _id: d._id.toHexString(),
    recipientId: d.recipientId,
    kind: d.kind,
    title: d.title,
    body: d.body,
    businessId: d.businessId ? d.businessId.toHexString() : null,
    createdById: d.createdById,
    createdAt: d.createdAt.toISOString(),
    seen: d.seen,
  };
}

export async function enqueueNotification(input: {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  businessId?: string | null;
  createdById: string;
}): Promise<void> {
  if (!input.recipientId) return;
  const doc: Omit<NotificationDoc, "_id"> = {
    recipientId: input.recipientId,
    kind: input.kind,
    title: input.title,
    body: input.body || "",
    businessId: input.businessId ? toObjectId(input.businessId) : null,
    createdById: input.createdById,
    createdAt: new Date(),
    seen: false,
  };
  await (await col.notifications()).insertOne(doc as NotificationDoc);
}

export async function listUnseen(recipientId: string): Promise<Notification[]> {
  const docs = await (await col.notifications())
    .find({ recipientId, seen: false })
    .sort({ _id: 1 })
    .toArray();
  return docs.map(toNotif);
}

export async function listRecent(
  recipientId: string,
  limit = 20,
): Promise<Notification[]> {
  const docs = await (await col.notifications())
    .find({ recipientId })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toNotif);
}

export async function markSeen(recipientId: string, ids: string[]): Promise<void> {
  const oids = ids.map((i) => toObjectId(i)).filter(Boolean) as ObjectId[];
  if (!oids.length) return;
  await (await col.notifications()).updateMany(
    { _id: { $in: oids }, recipientId },
    { $set: { seen: true } },
  );
}
