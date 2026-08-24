"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/apiClient";
import { fmtMoney } from "@/lib/currency";
import type { Currency } from "@/lib/types";

interface MonthPoint {
  month: string;
  income: number;
  expense: number;
}

export default function TrendChart({
  businessId,
  display,
}: {
  businessId: string;
  display: Currency;
}) {
  const { data } = useSWR<{ trend: MonthPoint[] }>(
    `/api/businesses/${businessId}/trend`,
    jsonFetcher,
    { refreshInterval: 15000 },
  );
  const trend = data?.trend ?? [];
  if (trend.length === 0) return null;

  const W = 720;
  const H = 200;
  const padL = 8;
  const padB = 22;
  const chartH = H - padB - 8;
  const max = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)));
  const n = trend.length;
  const groupW = (W - padL * 2) / n;
  const barW = Math.min(16, groupW / 2 - 3);

  const y = (v: number) => 8 + chartH - (v / max) * chartH;

  return (
    <div className="card mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">Monthly trend</h3>
        <div className="flex gap-4 text-xs" style={{ color: "var(--muted)" }}>
          <span><span style={{ color: "var(--green-text)" }}>■</span> Income</span>
          <span><span style={{ color: "var(--red-text)" }}>■</span> Expenses</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Monthly income and expenses">
        <line x1={padL} y1={8 + chartH} x2={W - padL} y2={8 + chartH} stroke="var(--border)" />
        {trend.map((t, i) => {
          const gx = padL + i * groupW + groupW / 2;
          const [mYear, mMon] = t.month.split("-");
          const label = `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mMon)]} ${mYear.slice(2)}`;
          return (
            <g key={t.month}>
              <rect x={gx - barW - 2} y={y(t.income)} width={barW} height={8 + chartH - y(t.income)} rx={2} fill="var(--green-text)">
                <title>{`${label} · Income ${fmtMoney(t.income, display)}`}</title>
              </rect>
              <rect x={gx + 2} y={y(t.expense)} width={barW} height={8 + chartH - y(t.expense)} rx={2} fill="var(--red-text)">
                <title>{`${label} · Expenses ${fmtMoney(t.expense, display)}`}</title>
              </rect>
              <text x={gx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
