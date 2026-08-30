import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireMutation, isResponse, jsonError } from "@/lib/http";
import { hasAccess } from "@/lib/repositories/businesses";
import { listTransactions, addTransaction } from "@/lib/repositories/transactions";
import { processMentions } from "@/lib/repositories/mentions";
import { recordEvent } from "@/lib/repositories/events";
import { addRecurrence, materializeDue } from "@/lib/repositories/recurrences";
import { PERIODS } from "@/lib/recurrence";
import { ensureIndexes } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (isResponse(ctx)) return ctx;
  const businessId = req.nextUrl.searchParams.get("businessId") || "";
  const type = req.nextUrl.searchParams.get("type");
  if (type !== "income" && type !== "expense") return jsonError(400, "type required");
  if (!(await hasAccess(businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  // Recurring rows are created lazily on read: whatever is due now, plus the
  // next one. Idempotent (unique recurrenceId+occurrenceAt), so a refresh or two
  // readers at once can't double-post.
  await ensureIndexes();
  await materializeDue(businessId).catch((e) =>
    console.error("[recurrence] materialize failed:", (e as Error).message),
  );
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
  // When present, the entry repeats from `date` and no one-off row is written —
  // the first occurrence is materialised by the rule itself.
  recurrence: z
    .object({
      period: z.enum(PERIODS),
      interval: z.number().int().min(1).max(365).default(1),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message || "Invalid input");
  const d = parsed.data;
  if (!(await hasAccess(d.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");

  if (d.recurrence) {
    await ensureIndexes();
    const rule = await addRecurrence({
      businessId: d.businessId,
      type: d.type,
      label: d.label,
      amount: d.amount,
      currency: d.currency,
      notes: d.notes,
      period: d.recurrence.period,
      interval: d.recurrence.interval,
      startDate: d.date,
      createdBy: ctx.sub,
    });
    if (!rule) return jsonError(400, "Could not create the repeating entry");
    // Post whatever is already due (and the next one) straight away, so the row
    // appears immediately rather than on some later read.
    await materializeDue(d.businessId).catch(() => {});
    await recordEvent(
      ctx.sub,
      `scheduled recurring ${d.type}`,
      `${d.label}: ${d.amount} ${d.currency} (${d.recurrence.period})`,
      d.businessId,
    );
    return NextResponse.json({ recurrence: rule }, { status: 201 });
  }

  const txn = await addTransaction({ ...d, createdBy: ctx.sub });
  await processMentions(d.type, txn._id, "notes", d.notes, d.businessId, ctx.sub);
  await recordEvent(ctx.sub, `added ${d.type}`, `${d.label}: ${d.amount} ${d.currency}`, d.businessId);
  return NextResponse.json({ transaction: txn }, { status: 201 });
}
