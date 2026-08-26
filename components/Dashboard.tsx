"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/apiClient";
import Sidebar from "./Sidebar";
import BusinessDetail from "./business/BusinessDetail";
import type { PublicUser } from "@/lib/types";

export default function Dashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const { data } = useSWR<{ users: PublicUser[] }>("/api/users", jsonFetcher, {
    refreshInterval: 20000,
  });
  const users = data?.users ?? [];

  function select(id: string) {
    setSelectedId(id);
    setNavOpen(false);
  }

  return (
    <div className="flex h-full">
      <Sidebar
        selectedId={selectedId}
        onSelect={select}
        users={users}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <div className="flex-1 overflow-auto">
        <div className="border-b p-2 md:hidden" style={{ borderColor: "var(--border)" }}>
          <button className="btn-ghost" onClick={() => setNavOpen(true)}>
            ☰ Businesses
          </button>
        </div>
        {selectedId ? (
          <BusinessDetail
            key={selectedId}
            id={selectedId}
            users={users}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div className="p-10 text-center" style={{ color: "var(--muted)" }}>
            Select a business from the sidebar, or add a new one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
