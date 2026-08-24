import { col, toObjectId, type TransactionDoc } from "@/lib/db";
import type { Currency, Transaction, TxnType } from "@/lib/types";
import { getFxRate } from "./settings";

// Editable fields (mirrors db.py _INCOME_FIELDS/_EXPENSE_FIELDS). fxRate is here
// so an explicit rate edit is allowed, but it is NEVER auto-recomputed elsewhere.
export const TXN_FIELDS = new Set(["date", "label", "amount", "currency", "notes", "fxRate"]);

function toTxn(d: TransactionDoc): Transaction {
  return {
    _id: d._id.toHexString(),
    businessId: d.businessId.toHexString(),
    type: d.type,
    date: d.date,
    label: d.label,
    amount: d.amount,
    currency: d.currency,
    fxRate: d.fxRate,
    notes: d.notes,
    createdBy: d.createdBy,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listTransactions(
  businessId: string,
  type: TxnType,
): Promise<Transaction[]> {
  const oid = toObjectId(businessId);
  if (!oid) return [];
  const docs = await (await col.transactions())
    .find({ businessId: oid, type })
    .sort({ date: -1, _id: -1 })
    .toArray();
  return docs.map(toTxn);
}

export async function addTransaction(input: {
  businessId: string;
  type: TxnType;
  date: string;
  label: string;
  amount: number;
  currency: Currency;
  notes: string;
  createdBy: string;
  fxRate?: number;
}): Promise<Transaction> {
  const oid = toObjectId(input.businessId);
  if (!oid) throw new Error("bad business id");
  const fxRate = input.fxRate ?? (await getFxRate()); // locked at creation
  const doc: Omit<TransactionDoc, "_id"> = {
    businessId: oid,
    type: input.type,
    date: input.date,
    label: input.label,
    amount: input.amount,
    currency: input.currency,
    fxRate,
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: new Date(),
  };
  const res = await (await col.transactions()).insertOne(doc as TransactionDoc);
  return toTxn({ ...(doc as TransactionDoc), _id: res.insertedId });
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const d = await (await col.transactions()).findOne({ _id: oid });
  return d ? toTxn(d) : null;
}

export async function updateTransaction(
  id: string,
  field: string,
  value: unknown,
): Promise<boolean> {
  if (!TXN_FIELDS.has(field)) return false;
  const oid = toObjectId(id);
  if (!oid) return false;
  await (await col.transactions()).updateOne({ _id: oid }, { $set: { [field]: value } });
  return true;
}

export async function deleteTransaction(id: string): Promise<void> {
  const oid = toObjectId(id);
  if (!oid) return;
  await (await col.transactions()).deleteOne({ _id: oid });
}
