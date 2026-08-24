"use client";

import useSWR from "swr";
import Link from "next/link";
import { jsonFetcher } from "@/lib/apiClient";

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

  if (error) {
    return (
      <div className="p-10 text-center" style={{ color: "var(--muted)" }}>
        Admins only. <Link href="/" className="underline">Back</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link href="/" className="btn-ghost text-sm">← Dashboard</Link>
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
