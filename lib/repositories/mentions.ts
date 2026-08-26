import { col } from "@/lib/db";
import { parseMentions } from "@/lib/mentions";
import { sendEmail } from "@/lib/mail";
import { listUsersByIds } from "./users";
import { getBusiness, listMembers } from "./businesses";
import { enqueueNotification } from "./notifications";

const LABEL: Record<string, string> = {
  income: "income note",
  expense: "expense note",
  plan: "plan",
  phase: "phase notes",
};

/**
 * On save of a note/description, notify NEWLY @-mentioned users (dedupe via
 * mentionState so editing doesn't re-notify), by in-app notification + email.
 * Port of ui.process_mentions. Best-effort; never throws into the request.
 */
export async function processMentions(
  entityType: string,
  entityId: string,
  field: string,
  text: string,
  businessId: string,
  authorSub: string,
): Promise<void> {
  try {
    // Only people who share this business (owner + members) can be mentioned —
    // walks to the root for subsidiaries. A name typed for a non-member simply
    // won't resolve, so they're never notified about content they can't access.
    const memberIds = await listMembers(businessId);
    const users = await listUsersByIds(memberIds);
    const byName = new Map(users.map((u) => [u.displayName, u]));
    const present = parseMentions(text || "", [...byName.keys()]);
    if (!present.size) return;

    const state = await col.mentionState();
    const already = new Set(
      (await state.find({ entityType, entityId, field }).toArray()).map(
        (r) => r.userId,
      ),
    );
    const biz = await getBusiness(businessId);
    const bizName = biz?.name ?? "a business";
    const label = LABEL[entityType] ?? entityType;

    for (const name of present) {
      const u = byName.get(name);
      if (!u) continue;
      if (already.has(u._id)) continue;
      // record dedupe first (so a mid-loop failure doesn't cause a re-fire)
      await state.updateOne(
        { entityType, entityId, field, userId: u._id },
        { $setOnInsert: { notifiedAt: new Date() } },
        { upsert: true },
      );
      if (u._id === authorSub) continue; // don't notify yourself
      await enqueueNotification({
        recipientId: u._id,
        kind: "mention",
        title: `You were mentioned`,
        body: `In ${bizName} (${label}): ${(text || "").trim().slice(0, 200)}`,
        businessId,
        createdById: authorSub,
      });
      if (u.email) {
        await sendEmail(
          u.email,
          `[Business Tracker] You were mentioned in ${bizName}`,
          `You were mentioned in ${bizName} (${label}).\n\n${(text || "").trim()}\n\n— Open Business Tracker to view.`,
        );
      }
    }
  } catch (e) {
    console.error("[mentions] failed:", (e as Error).message);
  }
}
