"use client";

import { fmtMoney } from "@/lib/currency";
import TrendChart from "./TrendChart";
import type { Business, Currency } from "@/lib/types";

interface Totals {
  income: number;
  expenses: number;
}
interface SubRow extends Business {
  net: number;
}

function Card({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card flex-1">
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

export default function OverviewTab({
  business,
  display,
  fxRate,
  totals,
  subs,
}: {
  business: Business;
  display: Currency;
  fxRate: number;
  totals: { own: Totals; withSubs: Totals };
  subs: SubRow[];
}) {
  const isParent = business.parentId === null;
  const t = isParent ? totals.withSubs : totals.own;
  const net = t.income - t.expenses;
  const incLabel = isParent && subs.length ? "Income (incl. subsidiaries)" : "Income";
  const expLabel = isParent && subs.length ? "Expenses (incl. subsidiaries)" : "Expenses";

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-1 text-sm" style={{ color: "var(--muted)" }}>
        {isParent ? "Top-level Business" : "Subsidiary"} · Phase: {business.phase}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Card label={incLabel} value={fmtMoney(t.income, display)} accent="var(--green-text)" />
        <Card label={expLabel} value={fmtMoney(t.expenses, display)} accent="var(--red-text)" />
        <Card label="Net" value={fmtMoney(net, display)} accent={net >= 0 ? "var(--green-text)" : "var(--red-text)"} />
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        Amounts in {display} (rate: 1 USD = {fxRate.toLocaleString()} JMD)
      </p>

      <TrendChart businessId={business._id} display={display} />

      {isParent && subs.length > 0 && (
        <>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Own only — Income: {fmtMoney(totals.own.income, display)} · Expenses:{" "}
            {fmtMoney(totals.own.expenses, display)} · Net:{" "}
            {fmtMoney(totals.own.income - totals.own.expenses, display)}
          </p>
          <h3 className="mt-6 mb-2 font-semibold">Subsidiaries</h3>
          <div className="space-y-2">
            {subs.map((s) => (
              <div key={s._id} className="card flex items-center justify-between py-2">
                <span className="font-medium">{s.name}</span>
                <span style={{ color: "var(--muted)" }}>Phase: {s.phase}</span>
                <span style={{ color: s.net >= 0 ? "var(--green-text)" : "var(--red-text)" }}>
                  Net: {fmtMoney(s.net, display)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
