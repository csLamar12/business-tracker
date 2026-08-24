"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { jsonFetcher, apiJson } from "@/lib/apiClient";
import { useChrome } from "./AppChrome";
import Modal from "./Modal";
import InvitePicker from "./InvitePicker";
import type { Business, PublicUser } from "@/lib/types";

interface Row {
  business: Business;
  subs: Business[];
}

export default function Sidebar({
  selectedId,
  onSelect,
  users,
  open,
  onClose,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  users: PublicUser[];
  open: boolean;
  onClose: () => void;
}) {
  const { me } = useChrome();
  const { data, mutate } = useSWR<{ businesses: Row[] }>(
    "/api/businesses",
    jsonFetcher,
    { refreshInterval: 10000 },
  );
  const [addOpen, setAddOpen] = useState(false);
  const [addParent, setAddParent] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [shareBiz, setShareBiz] = useState<Business | null>(null);

  useEffect(() => {
    const h = () => mutate();
    window.addEventListener("bt:refresh-businesses", h);
    return () => window.removeEventListener("bt:refresh-businesses", h);
  }, [mutate]);

  async function add() {
    if (!addName.trim()) return;
    const res = await apiJson<{ business: Business }>("/api/businesses", "POST", {
      name: addName.trim(),
      parentId: addParent,
    }).catch(() => null);
    setAddName("");
    setAddOpen(false);
    setAddParent(null);
    await mutate();
    if (res?.business && !addParent) onSelect(res.business._id);
  }

  const rows = data?.businesses ?? [];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={`glass w-64 shrink-0 flex-col overflow-y-auto md:static md:z-auto md:flex ${
          open ? "fixed inset-y-0 left-0 z-40 flex shadow-2xl" : "hidden md:flex"
        }`}
        style={{ borderRight: "1px solid var(--border)" }}
      >
      <div className="p-3">
        <button
          className="btn w-full"
          onClick={() => {
            setAddParent(null);
            setAddOpen(true);
          }}
        >
          + Add Business
        </button>
      </div>
      <div className="flex-1 px-2">
        {rows.length === 0 && (
          <p className="px-2 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No businesses yet.
          </p>
        )}
        {rows.map(({ business, subs }) => (
          <div key={business._id} className="mb-1">
            <div className="group flex items-center gap-1">
              <button
                className="flex-1 truncate rounded px-2 py-1.5 text-left text-sm"
                style={{
                  background: selectedId === business._id ? "var(--accent)" : "transparent",
                  color: selectedId === business._id ? "white" : "var(--text)",
                }}
                onClick={() => onSelect(business._id)}
              >
                {business.name}
              </button>
              <button
                className="btn-ghost px-1.5 py-1 text-xs"
                title="Add subsidiary"
                onClick={() => {
                  setAddParent(business._id);
                  setAddOpen(true);
                }}
              >
                +
              </button>
              {business.ownerId === me.id && (
                <button
                  className="btn-ghost px-1.5 py-1 text-xs"
                  title="Share"
                  onClick={() => setShareBiz(business)}
                >
                  ⤷
                </button>
              )}
            </div>
            {subs.map((s) => (
              <button
                key={s._id}
                className="ml-3 block w-[calc(100%-0.75rem)] truncate rounded px-2 py-1 text-left text-sm"
                style={{
                  background: selectedId === s._id ? "var(--accent)" : "transparent",
                  color: selectedId === s._id ? "white" : "var(--muted)",
                }}
                onClick={() => onSelect(s._id)}
              >
                ↳ {s.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      {addOpen && (
        <Modal
          title={addParent ? "New subsidiary" : "New business"}
          onClose={() => setAddOpen(false)}
        >
          <input
            className="input"
            autoFocus
            placeholder="Name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className="btn" onClick={add}>
              Create
            </button>
          </div>
        </Modal>
      )}

      {shareBiz && (
        <InvitePicker
          business={shareBiz}
          users={users}
          onClose={() => setShareBiz(null)}
        />
      )}
      </aside>
    </>
  );
}
