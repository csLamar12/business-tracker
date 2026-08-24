import { col, toObjectId, type EventDoc } from "@/lib/db";
import { getUser } from "./users";
import { getBusiness } from "./businesses";

/** Best-effort audit event; never throws into the request path. */
export async function recordEvent(
  actorId: string,
  action: string,
  detail: string,
  businessId?: string | null,
): Promise<void> {
  try {
    await (await col.events()).insertOne({
      actorId,
      action,
      detail,
      businessId: businessId ? toObjectId(businessId) : null,
      createdAt: new Date(),
    } as EventDoc);
  } catch (e) {
    console.error("[events]", (e as Error).message);
  }
}

export interface ActivityItem {
  actor: string;
  action: string;
  detail: string;
  businessName: string | null;
  at: string;
}

export async function listRecentEvents(limit = 50): Promise<ActivityItem[]> {
  const docs = await (await col.events())
    .find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  const out: ActivityItem[] = [];
  for (const d of docs) {
    const actor = await getUser(d.actorId);
    const biz = d.businessId ? await getBusiness(d.businessId.toHexString()) : null;
    out.push({
      actor: actor?.displayName ?? "Someone",
      action: d.action,
      detail: d.detail,
      businessName: biz?.name ?? null,
      at: d.createdAt.toISOString(),
    });
  }
  return out;
}
