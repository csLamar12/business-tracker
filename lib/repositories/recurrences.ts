import { ObjectId } from "mongodb";
import { col, toObjectId, type RecurrenceDoc, type TransactionDoc } from "@/lib/db";
import type { Currency, Recurrence, TxnType } from "@/lib/types";
import { occurrencesFrom, parseDateUtc, toYmd, type Period } from "@/lib/recurrence";
import { getFxRate } from "./settings";

function toRecurrence(d: RecurrenceDoc): Recurrence {
  return {
    _id: d._id.toHexString(),
    businessId: d.businessId.toHexString(),
    type: d.type,
    label: d.label,
    amount: d.amount,
    currency: d.currency,
    fxRate: d.fxRate,
    notes: d.notes,
    period: d.period,
    interval: d.interval,
    startDate: d.startDate,
    active: d.active,
    createdBy: d.createdBy,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listRecurrences(
  businessId: string,
  type?: TxnType,
): Promise<Recurrence[]> {
  const oid = toObjectId(businessId);
  if (!oid) return [];
  const filter: Record<string, unknown> = { businessId: oid, active: true };
  if (type) filter.type = type;
  const docs = await (await col.recurrences()).find(filter).sort({ _id: -1 }).toArray();
  return docs.map(toRecurrence);
}

export async function addRecurrence(input: {
  businessId: string;
  type: TxnType;
  label: string;
  amount: number;
  currency: Currency;
  notes: string;
  period: Period;
  interval: number;
  startDate: string;
  createdBy: string;
}): Promise<Recurrence | null> {
  const oid = toObjectId(input.businessId);
  if (!oid) return null;
  if (!parseDateUtc(input.startDate)) return null;
  const doc: Omit<RecurrenceDoc, "_id"> = {
    businessId: oid,
    type: input.type,
    label: input.label,
    amount: input.amount,
    currency: input.currency,
    fxRate: await getFxRate(), // locked at creation, as transactions are
    notes: input.notes,
    period: input.period,
    interval: Math.max(1, Math.floor(input.interval || 1)),
    startDate: input.startDate,
    active: true,
    createdBy: input.createdBy,
    createdAt: new Date(),
  };
  const res = await (await col.recurrences()).insertOne(doc as RecurrenceDoc);
  return toRecurrence({ ...(doc as RecurrenceDoc), _id: res.insertedId });
}

/** Stop a rule. Occurrences it already produced are left alone — they are real
 * records of money that was (or was scheduled to be) moved. */
export async function stopRecurrence(id: string): Promise<boolean> {
  const oid = toObjectId(id);
  if (!oid) return false;
  const r = await (await col.recurrences()).updateOne(
    { _id: oid },
    { $set: { active: false } },
  );
  return r.matchedCount > 0;
}

export async function getRecurrence(id: string): Promise<Recurrence | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const d = await (await col.recurrences()).findOne({ _id: oid });
  return d ? toRecurrence(d) : null;
}

/**
 * Create the transaction rows a business's active rules are owed: everything due
 * up to now, plus the single next upcoming occurrence.
 *
 * Safe to call on every read. The unique (recurrenceId, occurrenceAt) index makes
 * it idempotent, so concurrent readers can't double-post an occurrence; duplicate
 * key errors are the expected outcome of a race, not a failure.
 *
 * Rows land as `pending: true` and are excluded from every total until the user
 * ticks them off.
 */
export async function materializeDue(businessId: string): Promise<number> {
  const oid = toObjectId(businessId);
  if (!oid) return 0;
  const rules = await (await col.recurrences())
    .find({ businessId: oid, active: true })
    .toArray();
  if (!rules.length) return 0;

  const txns = await col.transactions();
  const now = new Date();
  let created = 0;

  for (const rule of rules) {
    const start = parseDateUtc(rule.startDate);
    if (!start) continue;

    // How far this rule has ever generated. Comparing against rows that still
    // EXIST would resurrect anything the user deleted on the very next read, so
    // the mark is stored on the rule and only ever moves forward. Rules created
    // before the mark existed are backfilled from their newest row once.
    let highWater: Date | null = rule.lastOccurrenceAt ?? null;
    if (!highWater) {
      const newest = await txns
        .find({ recurrenceId: rule._id }, { projection: { occurrenceAt: 1 } })
        .sort({ occurrenceAt: -1 })
        .limit(1)
        .toArray();
      highWater = newest[0]?.occurrenceAt ?? null;
    }

    const { due, next } = occurrencesFrom(
      start,
      rule.period,
      rule.interval,
      now,
      500,
      highWater,
    );
    // "Today + next upcoming": everything already due, and one ahead so the
    // user can see what's coming without the table filling with projections.
    const fresh =
      next && (!highWater || next.getTime() > highWater.getTime())
        ? [...due, next]
        : due;
    if (!fresh.length) continue;

    const docs = fresh.map((when) => ({
      businessId: oid,
      type: rule.type,
      date: toYmd(when),
      label: rule.label,
      amount: rule.amount,
      currency: rule.currency,
      fxRate: rule.fxRate,
      notes: rule.notes,
      createdBy: rule.createdBy,
      createdAt: new Date(),
      recurrenceId: rule._id,
      occurrenceAt: when,
      pending: true,
    })) as TransactionDoc[];

    try {
      const r = await txns.insertMany(docs, { ordered: false });
      created += r.insertedCount;
    } catch (e) {
      // A concurrent reader won the race for some of these. Anything that got
      // in is in; the rest already exist. Only a non-duplicate error is a bug.
      const code = (e as { code?: number }).code;
      const writeErrors = (e as { writeErrors?: unknown[] }).writeErrors;
      if (code !== 11000 && !writeErrors) throw e;
      created += (e as { result?: { nInserted?: number } }).result?.nInserted ?? 0;
    }

    // Advance the mark even if some inserts lost a race — those occurrences
    // exist either way, and leaving the mark behind would re-offer them.
    const furthest = fresh[fresh.length - 1];
    await (await col.recurrences()).updateOne(
      { _id: rule._id },
      { $set: { lastOccurrenceAt: furthest } },
    );
  }
  return created;
}

/**
 * Push an edit made on one occurrence out to the rest of the series.
 *
 * Only ever called for a row that is still PENDING. A confirmed occurrence is a
 * record of money that already moved, so editing one of those is a correction to
 * that instance alone and must not rewrite the others.
 *
 * Editing the date re-anchors the schedule: the rule's start moves, every
 * unconfirmed occurrence is dropped, and the series regenerates from the new
 * date on the next read. Confirmed rows are history and stay where they are.
 */
export async function applyToSeries(
  recurrenceId: string,
  field: string,
  value: unknown,
): Promise<void> {
  const rid = toObjectId(recurrenceId);
  if (!rid) return;
  const recs = await col.recurrences();
  const txns = await col.transactions();

  if (field === "date") {
    const ymd = String(value);
    if (!parseDateUtc(ymd)) return;
    await recs.updateOne(
      { _id: rid },
      { $set: { startDate: ymd, lastOccurrenceAt: null } },
    );
    await txns.deleteMany({ recurrenceId: rid, pending: true });
    return;
  }
  if (!["label", "amount", "currency", "notes"].includes(field)) return;
  await recs.updateOne({ _id: rid }, { $set: { [field]: value } });
  await txns.updateMany(
    { recurrenceId: rid, pending: true },
    { $set: { [field]: value } },
  );
}

/** Tick / untick a generated occurrence. */
export async function setPending(id: string, pending: boolean): Promise<boolean> {
  const oid = toObjectId(id);
  if (!oid) return false;
  const r = await (await col.transactions()).updateOne(
    { _id: oid, recurrenceId: { $type: "objectId" } },
    { $set: { pending } },
  );
  return r.matchedCount > 0;
}

export type { ObjectId };
