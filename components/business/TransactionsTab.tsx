"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher, apiJson } from "@/lib/apiClient";
import { convert, fmtMoney } from "@/lib/currency";
import { todayIso } from "@/lib/util";
import { toCsv, parseCsv, downloadCsv } from "@/lib/csv";
import MentionInput from "../MentionInput";
import Cell from "./Cell";
import type { Currency, PublicUser, Transaction, TxnType } from "@/lib/types";

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

  const [date, setDate] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(display);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");

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
    await apiJson("/api/transactions", "POST", {
      businessId,
      type,
      date,
      label: label.trim(),
      amount: amt,
      currency,
      notes,
    }).catch(() => {});
    mutate();
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

  const total = rows.reduce(
    (s, r) => s + convert(r.amount, r.currency, display, r.fxRate || fxRate),
    0,
  );

  return (
    <div className="p-4">
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex-1 min-w-40">
          <label className="label">{labelWord}</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
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
        <div className="flex-1 min-w-48">
          <label className="label">Notes (@ to mention)</label>
          <MentionInput value={notes} onChange={setNotes} names={names} placeholder="" onEnter={add} />
        </div>
        <button className="btn" onClick={add}>
          Add {type === "income" ? "Income" : "Expense"}
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="text-sm font-semibold">Total: {fmtMoney(total, display)}</div>
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
              <tr key={r._id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="p-2 w-28"><Cell value={r.date} type="date" onSave={(v) => edit(r._id, "date", v)} /></td>
                <td className="p-2"><Cell value={r.label} onSave={(v) => edit(r._id, "label", v)} /></td>
                <td className="p-2 w-24"><Cell value={String(r.amount)} type="number" onSave={(v) => edit(r._id, "amount", v)} /></td>
                <td className="p-2 w-20"><Cell value={r.currency} type="select" options={["USD", "JMD"]} onSave={(v) => edit(r._id, "currency", v)} /></td>
                <td className="p-2 w-20"><Cell value={String(r.fxRate)} type="number" onSave={(v) => edit(r._id, "fxRate", v)} /></td>
                <td className="p-2 whitespace-nowrap">{fmtMoney(convert(r.amount, r.currency, display, r.fxRate || fxRate), display)}</td>
                <td className="p-2 max-w-48"><Cell value={r.notes} onSave={(v) => edit(r._id, "notes", v)} /></td>
                <td className="p-2" style={{ color: "var(--muted)" }}>{nameById.get(r.createdBy) ?? "—"}</td>
                <td className="p-2">
                  <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => del(r._id)}>✕</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center" style={{ color: "var(--muted)" }}>{query ? "No matches." : "No entries yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
