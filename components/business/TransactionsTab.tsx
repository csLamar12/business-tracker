"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { jsonFetcher, apiJson } from "@/lib/apiClient";
import { convert, fmtMoney } from "@/lib/currency";
import { todayIso, relTime, fmtStampFull } from "@/lib/util";
import { toCsv, parseCsv, downloadCsv } from "@/lib/csv";
import MentionInput from "../MentionInput";
import AutocompleteInput from "../AutocompleteInput";
import Cell from "./Cell";
import { PERIODS, PERIOD_LABEL } from "@/lib/recurrence";
import type { Currency, PublicUser, Recurrence, Transaction, TxnType } from "@/lib/types";

export default function TransactionsTab({
  businessId,
  type,
  display,
  fxRate,
  names,
  users,
  onChanged,
}: {
  businessId: string;
  type: TxnType;
  display: Currency;
  fxRate: number;
  names: string[];
  users: PublicUser[];
  onChanged: () => void;
}) {
  const key = `/api/transactions?businessId=${businessId}&type=${type}`;
  const { data, mutate } = useSWR<{ transactions: Transaction[] }>(key, jsonFetcher, {
    refreshInterval: 10000,
  });
  const rows = data?.transactions ?? [];
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));

  // Autocomplete "memory" for the Source/Category and Notes fields: values used
  // before (server, most-used first) merged with what's on screen, de-duped.
  const { data: labelData } = useSWR<{ labels: string[]; notes: string[] }>(
    `/api/transactions/labels?type=${type}`,
    jsonFetcher,
    { refreshInterval: 60000 },
  );
  const dedupe = (server: string[], local: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (s: string) => {
      const t = (s ?? "").trim();
      const k = t.toLowerCase();
      if (!t || seen.has(k)) return;
      seen.add(k);
      out.push(t);
    };
    server.forEach(push);
    local.forEach(push);
    return out;
  };
  const labelPool = useMemo(
    () => dedupe(labelData?.labels ?? [], rows.map((r) => r.label)),
    [labelData, rows],
  );
  const notesPool = useMemo(
    () => dedupe(labelData?.notes ?? [], rows.map((r) => r.notes)),
    [labelData, rows],
  );

  const [date, setDate] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(display);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [repeat, setRepeat] = useState<"" | (typeof PERIODS)[number]>("");

  const { data: recData, mutate: mutateRec } = useSWR<{ recurrences: Recurrence[] }>(
    `/api/recurrences?businessId=${businessId}&type=${type}`,
    jsonFetcher,
    { refreshInterval: 30000 },
  );
  const rules = recData?.recurrences ?? [];

  async function stopRule(r: Recurrence) {
    if (!confirm(`Stop repeating "${r.label}"? Entries already created stay.`)) return;
    await apiJson(`/api/recurrences/${r._id}`, "DELETE").catch(() => {});
    mutateRec();
    mutate();
  }

  // Ticking confirms the money actually moved; only then does it reach totals.
  async function confirmOccurrence(id: string, pending: boolean) {
    await apiJson(`/api/transactions/${id}`, "PATCH", { field: "pending", value: pending })
      .catch(() => {});
    mutate();
    onChanged();
  }

  const filtered = query
    ? rows.filter(
        (r) =>
          r.label.toLowerCase().includes(query.toLowerCase()) ||
          r.notes.toLowerCase().includes(query.toLowerCase()) ||
          r.date.includes(query),
      )
    : rows;

  function exportCsv() {
    const csv = toCsv(
      ["date", "label", "amount", "currency", "fxRate", "notes"],
      rows.map((r) => [r.date, r.label, r.amount, r.currency, r.fxRate, r.notes]),
    );
    downloadCsv(`${type}-${businessId}.csv`, csv);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) return;
    const header = parsed[0].map((h) => h.trim().toLowerCase());
    const start = header.includes("date") || header.includes("amount") ? 1 : 0;
    const col = (name: string) => header.indexOf(name);
    let ok = 0;
    for (let i = start; i < parsed.length; i++) {
      const r = parsed[i];
      const d = start ? r[col("date")] : r[0];
      const lbl = start ? r[col("label")] : r[1];
      const amt = parseFloat(start ? r[col("amount")] : r[2]);
      const cur = ((start ? r[col("currency")] : r[3]) || "USD").toUpperCase();
      const note = (start ? r[col("notes")] : r[5]) || "";
      if (!d || !lbl || Number.isNaN(amt)) continue;
      await apiJson("/api/transactions", "POST", {
        businessId,
        type,
        date: d.trim(),
        label: lbl.trim(),
        amount: amt,
        currency: cur === "JMD" ? "JMD" : "USD",
        notes: note,
      }).then(() => ok++).catch(() => {});
    }
    mutate();
    onChanged();
    alert(`Imported ${ok} rows.`);
  }

  const labelWord = type === "income" ? "Source" : "Category";

  async function add() {
    const amt = parseFloat(amount);
    if (!label.trim() || Number.isNaN(amt)) return;
    setLabel("");
    setAmount("");
    setNotes("");
    const chosen = repeat;
    setRepeat("");
    await apiJson("/api/transactions", "POST", {
      businessId,
      type,
      date,
      label: label.trim(),
      amount: amt,
      currency,
      notes,
      ...(chosen ? { recurrence: { period: chosen, interval: 1 } } : {}),
    }).catch(() => {});
    mutate();
    mutateRec();
    onChanged();
  }

  async function edit(id: string, field: string, value: string) {
    const val = field === "amount" || field === "fxRate" ? parseFloat(value) : value;
    await apiJson(`/api/transactions/${id}`, "PATCH", { field, value: val }).catch(() => {});
    mutate();
    onChanged();
  }

  async function del(id: string) {
    if (!confirm("Delete this entry?")) return;
    await apiJson(`/api/transactions/${id}`, "DELETE").catch(() => {});
    mutate();
    onChanged();
  }

  // Mirrors the server: unticked occurrences are scheduled, not moved, so they
  // stay out of the total.
  const total = rows
    .filter((r) => !r.pending)
    .reduce((s, r) => s + convert(r.amount, r.currency, display, r.fxRate || fxRate), 0);
  const pendingCount = rows.filter((r) => r.pending).length;

  return (
    <div className="p-4">
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex-1 min-w-40">
          <label className="label">{labelWord}</label>
          <AutocompleteInput value={label} onChange={setLabel} suggestions={labelPool} onEnter={add} />
        </div>
        <div className="w-28">
          <label className="label">Amount</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="w-24">
          <label className="label">Currency</label>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option>USD</option>
            <option>JMD</option>
          </select>
        </div>
        <div className="w-32">
          <label className="label">Repeat</label>
          <select
            className="input"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as typeof repeat)}
            title="Repeat this entry from the date above"
          >
            <option value="">One-off</option>
            {PERIODS.map((p) => (
              <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="label">Notes (@ to mention)</label>
          <MentionInput value={notes} onChange={setNotes} names={names} suggestions={notesPool} placeholder="" onEnter={add} />
        </div>
        <button className="btn" onClick={add}>
          Add {type === "income" ? "Income" : "Expense"}
        </button>
      </div>

      {rules.length > 0 && (
        <div className="card mb-4">
          <div className="mb-2 text-sm font-semibold">
            Repeating {type === "income" ? "income" : "expenses"}
          </div>
          <div className="space-y-1 text-sm">
            {rules.map((r) => (
              <div key={r._id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.label}</span>
                <span style={{ color: "var(--muted)" }}>
                  {fmtMoney(r.amount, r.currency)} · {PERIOD_LABEL[r.period]}
                  {r.interval > 1 ? ` ×${r.interval}` : ""} · from {r.startDate}
                </span>
                <button
                  className="btn-ghost ml-auto text-xs"
                  onClick={() => stopRule(r)}
                  title="Stop creating new entries. Existing ones stay."
                >
                  Stop
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="text-sm font-semibold">
          Total: {fmtMoney(total, display)}
          {pendingCount > 0 && (
            <span className="ml-2 font-normal" style={{ color: "var(--muted)" }}>
              ({pendingCount} awaiting confirmation, not counted)
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            className="input w-48 py-1"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-ghost text-xs" onClick={exportCsv}>Export CSV</button>
          <label className="btn-ghost cursor-pointer text-xs">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="glass overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--muted)" }} className="text-left">
              <th className="w-8 p-2" title="Tick a repeating entry once the money has actually moved"></th>
              <th className="p-2">Date</th>
              <th className="p-2">{labelWord}</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Cur</th>
              <th className="p-2">Rate</th>
              <th className="p-2">In {display}</th>
              <th className="p-2">Notes</th>
              <th className="p-2">By</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r._id}
                style={{
                  borderTop: "1px solid var(--border)",
                  // Dimmed so a projection never reads as a settled figure.
                  opacity: r.pending ? 0.55 : 1,
                }}
              >
                <td className="p-2 align-top">
                  {r.recurrenceId ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                      checked={!r.pending}
                      onChange={() => confirmOccurrence(r._id, !!r.pending ? false : true)}
                      title={
                        r.pending
                          ? `Confirm this ${type === "income" ? "was received" : "was paid"} — it then counts toward totals`
                          : "Confirmed. Untick to put it back to due."
                      }
                    />
                  ) : null}
                </td>
                <td className="p-2 w-28">
                  <Cell value={r.date} type="date" onSave={(v) => edit(r._id, "date", v)} />
                  {r.pending && (
                    <span
                      className="mt-0.5 inline-block rounded px-1 text-[9px] font-bold uppercase"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    >
                      due
                    </span>
                  )}
                </td>
                <td className="p-2"><Cell value={r.label} onSave={(v) => edit(r._id, "label", v)} /></td>
                <td className="p-2 w-24"><Cell value={String(r.amount)} display={r.amount.toFixed(2)} type="number" onSave={(v) => edit(r._id, "amount", v)} /></td>
                <td className="p-2 w-20"><Cell value={r.currency} type="select" options={["USD", "JMD"]} onSave={(v) => edit(r._id, "currency", v)} /></td>
                <td className="p-2 w-20"><Cell value={String(r.fxRate)} type="number" onSave={(v) => edit(r._id, "fxRate", v)} /></td>
                <td className="p-2 whitespace-nowrap">{fmtMoney(convert(r.amount, r.currency, display, r.fxRate || fxRate), display)}</td>
                <td className="p-2 max-w-48"><Cell value={r.notes} expandable mentionNames={names} onSave={(v) => edit(r._id, "notes", v)} /></td>
                <td className="p-2" style={{ color: "var(--muted)" }}>{nameById.get(r.createdBy) ?? "—"}</td>
                <td className="p-2 text-right align-top whitespace-nowrap">
                  <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => del(r._id)} title="Delete entry">✕</button>
                  <div
                    className="mt-1 text-[10px] leading-none"
                    style={{ color: "var(--muted)" }}
                    title={`Added ${fmtStampFull(r.createdAt)}`}
                  >
                    {relTime(r.createdAt)}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-4 text-center" style={{ color: "var(--muted)" }}>{query ? "No matches." : "No entries yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
