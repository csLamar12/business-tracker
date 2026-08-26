"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { jsonFetcher, apiJson } from "@/lib/apiClient";
import type { PublicUser } from "@/lib/types";

interface Activity {
  actor: string;
  action: string;
  detail: string;
  businessName: string | null;
  at: string;
}
interface BizRow {
  id: string;
  name: string;
  owner: string;
  members: number;
}

export default function AdminPage() {
  const { data, error } = useSWR<{ events: Activity[]; businesses: BizRow[] }>(
    "/api/admin/activity",
    jsonFetcher,
    { refreshInterval: 15000 },
  );
  const { data: usersData, mutate: mutateUsers } = useSWR<{ users: PublicUser[] }>(
    "/api/users",
    jsonFetcher,
  );

  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <div className="p-10 text-center" style={{ color: "var(--muted)" }}>
        Admins only. <Link href="/" className="underline">Back</Link>
      </div>
    );
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await apiJson("/api/admin/users", "POST", { email: newEmail.trim() });
      setMsg(`Created ${newEmail.trim()} — they were emailed a code to set their password.`);
      setNewEmail("");
      mutateUsers();
    } catch (err) {
      setMsg((err as Error).message);
    }
    setBusy(false);
  }

  async function reset(u: PublicUser) {
    if (!confirm(`Email ${u.displayName} (${u.email}) a link to reset their password?`)) return;
    setMsg("");
    try {
      await apiJson(`/api/admin/users/${u.id}/reset`, "POST");
      setMsg(`Password-reset email sent to ${u.email}.`);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const users = usersData?.users ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link href="/" className="btn-ghost text-sm">← Dashboard</Link>
      </div>

      {/* Users */}
      <div className="card mb-6">
        <h2 className="mb-3 text-base font-semibold">Users</h2>
        <form onSubmit={addUser} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-56">
            <label className="label">Add a user by email</label>
            <input
              className="input"
              type="email"
              placeholder="person@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <button className="btn" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        {msg && (
          <p className="mb-3 text-sm" style={{ color: "var(--green-text)" }}>{msg}</p>
        )}
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-2 text-sm">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: u.online ? "var(--green-text)" : "#cabfae" }}
              />
              <span className="font-medium">{u.displayName}</span>
              {u.isAdmin && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
                  ADMIN
                </span>
              )}
              <span style={{ color: "var(--muted)" }}>{u.email}</span>
              <button className="btn-ghost ml-auto text-xs" onClick={() => reset(u)}>
                Reset password
              </button>
            </div>
          ))}
          {users.length === 0 && (
            <p className="py-2" style={{ color: "var(--muted)" }}>No users yet.</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 text-base font-semibold">All businesses</h2>
          <div className="space-y-1 text-sm">
            {(data?.businesses ?? []).map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b py-1.5 last:border-0" style={{ borderColor: "var(--border)" }}>
                <span className="font-medium">{b.name}</span>
                <span style={{ color: "var(--muted)" }}>{b.owner} · {b.members} member{b.members === 1 ? "" : "s"}</span>
              </div>
            ))}
            {!data?.businesses?.length && <p style={{ color: "var(--muted)" }}>None yet.</p>}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
          <div className="max-h-96 space-y-2 overflow-y-auto text-sm">
            {(data?.events ?? []).map((e, i) => (
              <div key={i} className="border-b py-1.5 last:border-0" style={{ borderColor: "var(--border)" }}>
                <span className="font-medium">{e.actor}</span> {e.action}
                {e.detail ? <> — {e.detail}</> : null}
                {e.businessName ? <span style={{ color: "var(--muted)" }}> in {e.businessName}</span> : null}
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {new Date(e.at).toLocaleString()}
                </div>
              </div>
            ))}
            {!data?.events?.length && <p style={{ color: "var(--muted)" }}>No activity yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
