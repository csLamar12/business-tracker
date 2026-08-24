"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher, apiJson } from "@/lib/apiClient";
import OverviewTab from "./OverviewTab";
import TransactionsTab from "./TransactionsTab";
import PlansTab from "./PlansTab";
import PhaseTab from "./PhaseTab";
import InvitePicker from "../InvitePicker";
import Modal from "../Modal";
import type { Business, Currency, PublicUser } from "@/lib/types";

interface DetailData {
  business: Business;
  display: Currency;
  fxRate: number;
  isOwner: boolean;
  totals: { own: { income: number; expenses: number }; withSubs: { income: number; expenses: number } };
  subs: (Business & { net: number })[];
  members: PublicUser[];
}

const TABS = ["Overview", "Income", "Expenses", "Plans", "Phase"] as const;
type Tab = (typeof TABS)[number];

export default function BusinessDetail({
  id,
  names,
  users,
  onDeleted,
}: {
  id: string;
  names: string[];
  users: PublicUser[];
  onDeleted: () => void;
}) {
  const { data, mutate } = useSWR<DetailData>(`/api/businesses/${id}`, jsonFetcher, {
    refreshInterval: 10000,
  });
  const [tab, setTab] = useState<Tab>("Overview");
  const [share, setShare] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = () => {
    mutate();
    window.dispatchEvent(new Event("bt:refresh-businesses"));
  };

  if (!data) return <div className="p-8" style={{ color: "var(--muted)" }}>Loading…</div>;
  const { business } = data;

  async function rename() {
    if (newName.trim()) {
      await apiJson(`/api/businesses/${id}`, "PATCH", { name: newName.trim() }).catch(() => {});
      setRenaming(false);
      refresh();
    }
  }
  async function del() {
    if (!confirm(`Delete “${business.name}”? This removes its data${business.parentId ? "" : " and all subsidiaries"}.`)) return;
    await apiJson(`/api/businesses/${id}`, "DELETE").catch(() => {});
    onDeleted();
    window.dispatchEvent(new Event("bt:refresh-businesses"));
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 pt-5">
        <h1 className="text-2xl font-bold">{business.name}</h1>
        <div className="flex gap-2">
          {data.isOwner && (
            <button className="btn px-3 py-1.5 text-sm" onClick={() => setShare(true)}>Share</button>
          )}
          <button className="btn-ghost text-sm" onClick={() => { setNewName(business.name); setRenaming(true); }}>Rename</button>
          <button className="btn-danger px-3 py-1.5 text-sm" onClick={del}>Delete</button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b px-6" style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            className="px-4 py-2 text-sm font-medium"
            style={{
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t ? "var(--text)" : "var(--muted)",
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <OverviewTab business={business} display={data.display} fxRate={data.fxRate} totals={data.totals} subs={data.subs} />
      )}
      {tab === "Income" && (
        <TransactionsTab businessId={id} type="income" display={data.display} fxRate={data.fxRate} names={names} users={users} onChanged={refresh} />
      )}
      {tab === "Expenses" && (
        <TransactionsTab businessId={id} type="expense" display={data.display} fxRate={data.fxRate} names={names} users={users} onChanged={refresh} />
      )}
      {tab === "Plans" && <PlansTab businessId={id} names={names} users={users} />}
      {tab === "Phase" && <PhaseTab business={business} names={names} onChanged={refresh} />}

      {share && <InvitePicker business={business} users={users} onClose={() => setShare(false)} />}
      {renaming && (
        <Modal title="Rename business" onClose={() => setRenaming(false)}>
          <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRenaming(false)}>Cancel</button>
            <button className="btn" onClick={rename}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
