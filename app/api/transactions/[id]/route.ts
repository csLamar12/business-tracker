import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMutation, isResponse, jsonError } from "@/lib/http";
import { hasAccess } from "@/lib/repositories/businesses";
import {
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/repositories/transactions";
import { processMentions } from "@/lib/repositories/mentions";
import { setPending } from "@/lib/repositories/recurrences";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  field: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  const txn = await getTransaction(id);
  if (!txn) return jsonError(404, "Not found");
  if (!(await hasAccess(txn.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid input");

  // Ticking a recurring occurrence confirms the money actually moved, which is
  // what admits it to the totals. Handled apart from the editable-field
  // whitelist so `pending` can't be set on an ordinary one-off row.
  if (parsed.data.field === "pending") {
    const ok = await setPending(id, parsed.data.value === true || parsed.data.value === "true");
    if (!ok) return jsonError(400, "Not a recurring entry");
    return NextResponse.json({ ok: true });
  }

  const ok = await updateTransaction(id, parsed.data.field, parsed.data.value);
  if (!ok) return jsonError(400, "Field not editable");
  if (parsed.data.field === "notes") {
    await processMentions(txn.type, id, "notes", String(parsed.data.value), txn.businessId, ctx.sub);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireMutation(req);
  if (isResponse(ctx)) return ctx;
  const { id } = await params;
  const txn = await getTransaction(id);
  if (!txn) return NextResponse.json({ ok: true });
  if (!(await hasAccess(txn.businessId, ctx.sub, ctx.isAdmin))) return jsonError(403, "No access");
  await deleteTransaction(id);
  return NextResponse.json({ ok: true });
}
