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
interface BizAccess {
  id: string;
  name: string;
  ownerId: string | null;
  ownerName: string;
  memberIds: string[];
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
  const { data: access, mutate: mutateAccess } = useSWR<{
    users: PublicUser[];
    businesses: BizAccess[];
  }>("/api/admin/access", jsonFetcher, { refreshInterval: 20000 });

  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleAccess(biz: BizAccess, user: PublicUser, has: boolean) {
    const action = has ? "remove" : "add";
    // optimistic flip
    mutateAccess(
      (cur) =>
        cur && {
          ...cur,
          businesses: cur.businesses.map((b) =>
            b.id === biz.id
              ? {
                  ...b,
                  memberIds: has
                    ? b.memberIds.filter((id) => id !== user.id)
                    : [...b.memberIds, user.id],
                }
              : b,
          ),
        },
      false,
    );
    try {
      await apiJson("/api/admin/access", "POST", { businessId: biz.id, userId: user.id, action });
    } catch (err) {
      setMsg((err as Error).message);
    }
    mutateAccess();
  }

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
    const addr = newEmail.trim();
    try {
      const r = await apiJson<{ existed?: boolean }>("/api/admin/users", "POST", { email: addr });
      setMsg(
        r.existed
          ? `${addr} was already registered — sent them a fresh code to set their password.`
          : `Created ${addr} — they were emailed a code to set their password.`,
      );
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
    <div className="h-full overflow-y-auto">
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

      {/* Access matrix */}
      <div className="card mb-6">
        <h2 className="mb-1 text-base font-semibold">Access</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Who can see each top-level business. Subsidiaries inherit their parent&apos;s access.
          <span className="mx-1" style={{ color: "var(--accent)" }}>★</span> = owner (always has access);
          tick a box to grant access, untick to remove.
        </p>
        {access && access.businesses.length > 0 && access.users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr style={{ color: "var(--muted)" }}>
                  <th
                    className="sticky left-0 z-10 p-2 text-left"
                    style={{ background: "var(--surface)" }}
                  >
                    User
                  </th>
                  {access.businesses.map((b) => (
                    <th key={b.id} className="max-w-32 truncate p-2 text-center font-medium" title={b.name}>
                      {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {access.users.map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td
                      className="sticky left-0 z-10 whitespace-nowrap p-2"
                      style={{ background: "var(--surface)" }}
                    >
                      <span className="font-medium">{u.displayName}</span>
                      {u.isAdmin && (
                        <span className="ml-1 rounded px-1 text-[9px] font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
                          ADMIN
                        </span>
                      )}
                      <span className="ml-1 hidden md:inline" style={{ color: "var(--muted)" }}>{u.email}</span>
                    </td>
                    {access.businesses.map((b) => {
                      const isOwner = b.ownerId === u.id;
                      const has = b.memberIds.includes(u.id);
                      return (
                        <td key={b.id} className="p-2 text-center">
                          {isOwner ? (
                            <span title="Owner" style={{ color: "var(--accent)" }}>★</span>
                          ) : (
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer align-middle accent-[var(--accent)]"
                              checked={has}
                              onChange={() => toggleAccess(b, u, has)}
                              title={has ? `Remove ${u.displayName}'s access` : `Give ${u.displayName} access`}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {access ? "No businesses to manage yet." : "Loading…"}
          </p>
        )}
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
    </div>
  );
}
