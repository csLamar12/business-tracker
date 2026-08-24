"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher, apiJson } from "@/lib/apiClient";
import { useChrome } from "./AppChrome";
import Modal from "./Modal";
import type { Business, PublicUser } from "@/lib/types";

export default function InvitePicker({
  business,
  users,
  onClose,
}: {
  business: Business;
  users: PublicUser[];
  onClose: () => void;
}) {
  const { me } = useChrome();
  const { data, mutate } = useSWR<{
    members: PublicUser[];
    pendingInvitees: string[];
  }>(`/api/businesses/${business._id}`, jsonFetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Set<string>>(new Set());

  const memberIds = new Set((data?.members ?? []).map((m) => m.id));
  const pending = new Set([...(data?.pendingInvitees ?? []), ...optimistic]);

  async function invite(u: PublicUser) {
    setBusy(u.id);
    setOptimistic((s) => new Set(s).add(u.id));
    await apiJson("/api/invites", "POST", {
      businessId: business._id,
      inviteeId: u.id,
    }).catch(() => {});
    setBusy(null);
    mutate();
  }

  const candidates = users.filter((u) => u.id !== me.id && !memberIds.has(u.id));

  return (
    <Modal title={`Share “${business.name}”`} onClose={onClose}>
      <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
        Invited people get the same full access once they accept.
      </p>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Everyone already has access.
          </p>
        )}
        {candidates.map((u) => (
          <div key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: u.online ? "var(--green-text)" : "#cabfae" }}
            />
            <span className="flex-1 text-sm">{u.displayName}</span>
            {pending.has(u.id) ? (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Invited ⏳
              </span>
            ) : (
              <button
                className="btn px-3 py-1 text-xs"
                disabled={busy === u.id}
                onClick={() => invite(u)}
              >
                Invite
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
