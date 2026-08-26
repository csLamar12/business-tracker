"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher, apiJson } from "@/lib/apiClient";
import MentionInput from "../MentionInput";
import Cell from "./Cell";
import { PLAN_STATUSES } from "@/lib/types";
import type { Plan, PlanStatus, PublicUser } from "@/lib/types";

export default function PlansTab({
  businessId,
  names,
  users,
}: {
  businessId: string;
  names: string[];
  users: PublicUser[];
}) {
  const key = `/api/plans?businessId=${businessId}`;
  const { data, mutate } = useSWR<{ plans: Plan[] }>(key, jsonFetcher, {
    refreshInterval: 10000,
  });
  const rows = data?.plans ?? [];
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<PlanStatus>(PLAN_STATUSES[0]);
  const [description, setDescription] = useState("");

  async function add() {
    if (!title.trim()) return;
    setTitle("");
    setStartDate("");
    setTargetDate("");
    setDescription("");
    await apiJson("/api/plans", "POST", {
      businessId,
      title: title.trim(),
      startDate,
      targetDate,
      status,
      description,
    }).catch(() => {});
    mutate();
  }

  async function edit(id: string, field: string, value: string) {
    await apiJson(`/api/plans/${id}`, "PATCH", { field, value }).catch(() => {});
    mutate();
  }
  async function del(id: string) {
    if (!confirm("Delete this plan?")) return;
    await apiJson(`/api/plans/${id}`, "DELETE").catch(() => {});
    mutate();
  }

  return (
    <div className="p-4">
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-40">
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Start goal</label>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Finish goal</label>
          <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div className="w-36">
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
            {PLAN_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="label">Description (@ to mention)</label>
          <MentionInput value={description} onChange={setDescription} names={names} onEnter={add} />
        </div>
        <button className="btn" onClick={add}>Add Plan</button>
      </div>

      <div className="glass overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--muted)" }} className="text-left">
              <th className="p-2">Title</th>
              <th className="p-2">Start</th>
              <th className="p-2">Finish</th>
              <th className="p-2">Status</th>
              <th className="p-2">Description</th>
              <th className="p-2">By</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="p-2"><Cell value={r.title} onSave={(v) => edit(r._id, "title", v)} /></td>
                <td className="p-2 w-28"><Cell value={r.startDate} type="date" onSave={(v) => edit(r._id, "startDate", v)} /></td>
                <td className="p-2 w-28"><Cell value={r.targetDate} type="date" onSave={(v) => edit(r._id, "targetDate", v)} /></td>
                <td className="p-2 w-36"><Cell value={r.status} type="select" options={[...PLAN_STATUSES]} onSave={(v) => edit(r._id, "status", v)} /></td>
                <td className="p-2 max-w-xs"><Cell value={r.description} expandable onSave={(v) => edit(r._id, "description", v)} /></td>
                <td className="p-2" style={{ color: "var(--muted)" }}>{nameById.get(r.createdBy) ?? "—"}</td>
                <td className="p-2"><button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => del(r._id)}>✕</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center" style={{ color: "var(--muted)" }}>No plans yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
