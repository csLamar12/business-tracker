import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import { hasAccess } from "@/lib/repositories/businesses";
import { listTransactions, addTransaction } from "@/lib/repositories/transactions";
import { processMentions } from "@/lib/repositories/mentions";
import { recordEvent } from "@/lib/repositories/events";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const businessId = req.nextUrl.searchParams.get("businessId") || "";
  const type = req.nextUrl.searchParams.get("type");
  if (type !== "income" && type !== "expense") return jsonError(400, "type required");
  if (!(await hasAccess(businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  const rows = await listTransactions(businessId, type);
  return NextResponse.json({ transactions: rows });
}

const createSchema = z.object({
  businessId: z.string().min(1),
  type: z.enum(["income", "expense"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(200),
  amount: z.number().finite(),
  currency: z.enum(["USD", "JMD"]),
  notes: z.string().max(2000).default(""),
});

export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message || "Invalid input");
  const d = parsed.data;
  if (!(await hasAccess(d.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  const txn = await addTransaction({ ...d, createdBy: ctx.sub });
  await processMentions(d.type, txn._id, "notes", d.notes, d.businessId, ctx.sub);
  await recordEvent(ctx.sub, `added ${d.type}`, `${d.label}: ${d.amount} ${d.currency}`, d.businessId);
  return NextResponse.json({ transaction: txn }, { status: 201 });
}
