import { col, toObjectId, type PlanDoc } from "@/lib/db";
import type { Plan, PlanStatus } from "@/lib/types";
import { PLAN_STATUSES } from "@/lib/types";

export const PLAN_FIELDS = new Set(["title", "description", "startDate", "targetDate", "status"]);

function toPlan(d: PlanDoc): Plan {
  return {
    _id: d._id.toHexString(),
    businessId: d.businessId.toHexString(),
    title: d.title,
    description: d.description,
    startDate: d.startDate ?? "",
    targetDate: d.targetDate,
    status: d.status,
    createdBy: d.createdBy,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listPlans(businessId: string): Promise<Plan[]> {
  const oid = toObjectId(businessId);
  if (!oid) return [];
  const docs = await (await col.plans())
    .find({ businessId: oid })
    .sort({ _id: -1 })
    .toArray();
  return docs.map(toPlan);
}

export async function addPlan(input: {
  businessId: string;
  title: string;
  description: string;
  startDate: string;
  targetDate: string;
  status: PlanStatus;
  createdBy: string;
}): Promise<Plan> {
  const oid = toObjectId(input.businessId);
  if (!oid) throw new Error("bad business id");
  const doc: Omit<PlanDoc, "_id"> = {
    businessId: oid,
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    targetDate: input.targetDate,
    status: PLAN_STATUSES.includes(input.status) ? input.status : PLAN_STATUSES[0],
    createdBy: input.createdBy,
    createdAt: new Date(),
  };
  const res = await (await col.plans()).insertOne(doc as PlanDoc);
  return toPlan({ ...(doc as PlanDoc), _id: res.insertedId });
}

export async function getPlan(id: string): Promise<Plan | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const d = await (await col.plans()).findOne({ _id: oid });
  return d ? toPlan(d) : null;
}

export async function updatePlan(
  id: string,
  field: string,
  value: unknown,
): Promise<boolean> {
  if (!PLAN_FIELDS.has(field)) return false;
  const oid = toObjectId(id);
  if (!oid) return false;
  await (await col.plans()).updateOne({ _id: oid }, { $set: { [field]: value } });
  return true;
}

export async function deletePlan(id: string): Promise<void> {
  const oid = toObjectId(id);
  if (!oid) return;
  await (await col.plans()).deleteOne({ _id: oid });
}
