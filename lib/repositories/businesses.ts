import { ObjectId } from "mongodb";
import { col, toObjectId, type BusinessDoc } from "@/lib/db";
import { convert } from "@/lib/currency";
import type { Business, Currency, Phase } from "@/lib/types";
import { PHASES } from "@/lib/types";
import { getFxRate } from "./settings";

function toBusiness(d: BusinessDoc): Business {
  return {
    _id: d._id.toHexString(),
    name: d.name,
    parentId: d.parentId ? d.parentId.toHexString() : null,
    phase: d.phase,
    phaseNotes: d.phaseNotes,
    ownerId: d.ownerId,
    memberIds: d.memberIds || [],
    createdBy: d.createdBy,
    createdAt: d.createdAt.toISOString(),
  };
}

/** Top-level businesses visible to `sub` (owner or member); admins see all. */
export async function listTopLevelFor(
  sub: string,
  isAdmin = false,
): Promise<Business[]> {
  const businesses = await col.businesses();
  const filter = isAdmin
    ? { parentId: null }
    : { parentId: null, $or: [{ ownerId: sub }, { memberIds: sub }] };
  const docs = await businesses.find(filter).sort({ name: 1 }).toArray();
  return docs.map(toBusiness);
}

export async function listSubsidiaries(parentId: string): Promise<Business[]> {
  const oid = toObjectId(parentId);
  if (!oid) return [];
  const docs = await (await col.businesses())
    .find({ parentId: oid })
    .sort({ name: 1 })
    .toArray();
  return docs.map(toBusiness);
}

export async function getBusiness(id: string): Promise<Business | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const d = await (await col.businesses()).findOne({ _id: oid });
  return d ? toBusiness(d) : null;
}

/** Walk up to the top-level business id (subs are one level deep). */
export async function rootBusinessId(id: string): Promise<string | null> {
  const b = await getBusiness(id);
  if (!b) return null;
  return b.parentId ?? b._id;
}

export async function hasAccess(
  businessId: string,
  sub: string,
  isAdmin = false,
): Promise<boolean> {
  if (isAdmin) return true;
  const rootId = await rootBusinessId(businessId);
  if (!rootId) return false;
  const root = await getBusiness(rootId);
  if (!root) return false;
  return root.ownerId === sub || root.memberIds.includes(sub);
}

export async function createBusiness(
  name: string,
  parentId: string | null,
  ownerSub: string,
): Promise<Business> {
  const businesses = await col.businesses();
  const parentOid = parentId ? toObjectId(parentId) : null;
  const doc: Omit<BusinessDoc, "_id"> = {
    name: name.trim(),
    parentId: parentOid,
    phase: PHASES[0],
    phaseNotes: "",
    ownerId: parentOid ? null : ownerSub, // subsidiaries inherit; roots own
    memberIds: [],
    createdBy: ownerSub,
    createdAt: new Date(),
  };
  const res = await businesses.insertOne(doc as BusinessDoc);
  return toBusiness({ ...(doc as BusinessDoc), _id: res.insertedId });
}

export async function renameBusiness(id: string, name: string) {
  const oid = toObjectId(id);
  if (!oid) return;
  await (await col.businesses()).updateOne({ _id: oid }, { $set: { name: name.trim() } });
}

export async function updatePhase(id: string, phase: Phase, notes: string) {
  const oid = toObjectId(id);
  if (!oid) return;
  await (await col.businesses()).updateOne(
    { _id: oid },
    { $set: { phase, phaseNotes: notes } },
  );
}

/** Delete a business + (if root) its subsidiaries + all their transactions,
 * plans, invites, and related notifications. */
export async function deleteBusiness(id: string) {
  const oid = toObjectId(id);
  if (!oid) return;
  const businesses = await col.businesses();
  const subs = await businesses.find({ parentId: oid }).project({ _id: 1 }).toArray();
  const ids = [oid, ...subs.map((s) => s._id as ObjectId)];
  await Promise.all([
    (await col.transactions()).deleteMany({ businessId: { $in: ids } }),
    (await col.plans()).deleteMany({ businessId: { $in: ids } }),
    (await col.invites()).deleteMany({ businessId: { $in: ids } }),
    (await col.notifications()).deleteMany({ businessId: { $in: ids } }),
    businesses.deleteMany({ _id: { $in: ids } }),
  ]);
}

// ── membership ───────────────────────────────────────────────────────────────

export async function listMembers(businessId: string): Promise<string[]> {
  const rootId = await rootBusinessId(businessId);
  if (!rootId) return [];
  const root = await getBusiness(rootId);
  if (!root) return [];
  const out: string[] = [];
  if (root.ownerId) out.push(root.ownerId);
  for (const m of root.memberIds) if (!out.includes(m)) out.push(m);
  return out;
}

export async function addMember(businessId: string, sub: string) {
  const rootId = await rootBusinessId(businessId);
  if (!rootId) return;
  const oid = toObjectId(rootId);
  if (!oid) return;
  await (await col.businesses()).updateOne(
    { _id: oid },
    { $addToSet: { memberIds: sub } },
  );
}

export async function removeMember(businessId: string, sub: string) {
  const rootId = await rootBusinessId(businessId);
  if (!rootId) return;
  const oid = toObjectId(rootId);
  if (!oid) return;
  await (await col.businesses()).updateOne(
    { _id: oid },
    { $pull: { memberIds: sub } },
  );
}

// ── rollups ──────────────────────────────────────────────────────────────────

export interface Totals {
  income: number;
  expenses: number;
}

async function sumFor(
  businessIds: ObjectId[],
  display: Currency,
  fallback: number,
): Promise<Totals> {
  if (!businessIds.length) return { income: 0, expenses: 0 };
  const rows = await (await col.transactions())
    .find(
      { businessId: { $in: businessIds } },
      { projection: { type: 1, amount: 1, currency: 1, fxRate: 1 } },
    )
    .toArray();
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    const v = convert(r.amount, r.currency, display, r.fxRate || fallback);
    if (r.type === "income") income += v;
    else expenses += v;
  }
  return { income, expenses };
}

/** Own totals (this business only) + rolled-up totals (incl. subsidiaries). */
export async function businessTotals(
  businessId: string,
  display: Currency,
): Promise<{ own: Totals; withSubs: Totals; subs: Business[] }> {
  const fallback = await getFxRate();
  const root = await getBusiness(businessId);
  if (!root) return { own: { income: 0, expenses: 0 }, withSubs: { income: 0, expenses: 0 }, subs: [] };
  const rootOid = new ObjectId(root._id);
  const own = await sumFor([rootOid], display, fallback);
  const subs = root.parentId ? [] : await listSubsidiaries(root._id);
  const allIds = [rootOid, ...subs.map((s) => new ObjectId(s._id))];
  const withSubs = subs.length ? await sumFor(allIds, display, fallback) : own;
  return { own, withSubs, subs };
}

export async function subsidiaryNet(
  subId: string,
  display: Currency,
): Promise<Totals> {
  const fallback = await getFxRate();
  return sumFor([new ObjectId(subId)], display, fallback);
}

export interface MonthPoint {
  month: string; // YYYY-MM
  income: number;
  expense: number;
}

/** Monthly income/expense totals (incl. subsidiaries) for a trend chart. */
export async function monthlyTrend(
  businessId: string,
  display: Currency,
  months = 12,
): Promise<MonthPoint[]> {
  const fallback = await getFxRate();
  const root = await getBusiness(businessId);
  if (!root) return [];
  const rootOid = new ObjectId(root._id);
  const subs = root.parentId ? [] : await listSubsidiaries(root._id);
  const ids = [rootOid, ...subs.map((s) => new ObjectId(s._id))];
  const rows = await (await col.transactions())
    .find(
      { businessId: { $in: ids } },
      { projection: { type: 1, amount: 1, currency: 1, fxRate: 1, date: 1 } },
    )
    .toArray();
  const map = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const m = (r.date || "").slice(0, 7);
    if (!m) continue;
    const v = convert(r.amount, r.currency, display, r.fxRate || fallback);
    const e = map.get(m) || { income: 0, expense: 0 };
    if (r.type === "income") e.income += v;
    else e.expense += v;
    map.set(m, e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, v]) => ({ month, ...v }));
}
