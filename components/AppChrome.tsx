"use client";

import { useEffect, useRef, useState, createContext, useContext } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Currency } from "@/lib/types";
import { apiFetch, jsonFetcher, apiJson } from "@/lib/apiClient";
import ThemePicker from "./ThemePicker";
import type { PublicUser, Notification, Invite } from "@/lib/types";

interface Toast {
  id: number;
  title: string;
  body: string;
}

interface ChromeCtx {
  me: PublicUser;
  fxRate: number;
  refreshFx: () => void;
}
const Ctx = createContext<ChromeCtx | null>(null);
export const useChrome = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChrome outside provider");
  return c;
};

interface NotifData {
  unseen: Notification[];
  recent: Notification[];
  invites: Invite[];
  badge: number;
}

export default function AppChrome({
  user,
  children,
}: {
  user: PublicUser;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const toastedIds = useRef<Set<string>>(new Set());

  const { data: fxData, mutate: mutateFx } = useSWR<{ fxRate: number }>(
    "/api/settings",
    jsonFetcher,
  );
  const fxRate = fxData?.fxRate ?? 157;

  const [display, setDisplay] = useState<Currency>(user.displayCurrency);
  const [fxInput, setFxInput] = useState("157");
  useEffect(() => {
    setFxInput(String(fxRate));
  }, [fxRate]);

  async function changeCurrency(c: Currency) {
    setDisplay(c);
    await apiJson("/api/users/me", "PATCH", { displayCurrency: c }).catch(() => {});
    globalMutate(() => true); // re-fetch all data in the new display currency
  }
  async function saveRate() {
    const r = parseFloat(fxInput);
    if (!(r > 0)) return;
    await apiJson("/api/settings", "PATCH", { fxRate: r }).catch(() => {});
    mutateFx();
    globalMutate(() => true);
  }

  const { data: notif, mutate: mutateNotif } = useSWR<NotifData>(
    "/api/notifications",
    jsonFetcher,
    { refreshInterval: 10000 },
  );

  // Presence heartbeat + notification toasts.
  useEffect(() => {
    const beat = () => apiFetch("/api/presence", { method: "POST" }).catch(() => {});
    beat();
    const iv = setInterval(beat, 25000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Request browser-notification permission once.
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Toast + browser-notify unseen; then mark seen.
  useEffect(() => {
    if (!notif?.unseen?.length) return;
    const fresh = notif.unseen.filter((n) => !toastedIds.current.has(n._id));
    if (!fresh.length) return;
    for (const n of fresh) {
      toastedIds.current.add(n._id);
      setToasts((t) => [...t, { id: Date.now() + Math.random(), title: n.title, body: n.body }]);
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        try {
          new Notification(n.title, { body: n.body });
        } catch {}
      }
    }
    apiJson("/api/notifications", "POST", { ids: fresh.map((n) => n._id) })
      .then(() => mutateNotif())
      .catch(() => {});
  }, [notif, mutateNotif]);

  function dismissToast(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function resolveInvite(id: string, action: "accept" | "decline") {
    await apiJson(`/api/invites/${id}`, "POST", { action }).catch(() => {});
    mutateNotif();
    // a newly-accepted business should appear in the sidebar
    window.dispatchEvent(new Event("bt:refresh-businesses"));
  }

  const badge = notif?.badge ?? 0;

  return (
    <Ctx.Provider value={{ me: user, fxRate, refreshFx: () => mutateFx() }}>
      <div className="flex h-screen flex-col">
        <header
          className="glass flex h-14 items-center justify-between px-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="display shrink-0 whitespace-nowrap text-base font-semibold sm:text-lg" style={{ color: "var(--accent)" }}>
            <span className="hidden sm:inline">Business Tracker</span>
            <span className="sm:hidden">Tracker</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {user.isAdmin && (
              <Link href="/admin" className="btn-ghost px-2 text-sm">
                Admin
              </Link>
            )}
            <ThemePicker />
            <div className="relative">
              <button className="btn-ghost px-2" onClick={() => setBellOpen((o) => !o)}>
                🔔
                {badge > 0 && (
                  <span
                    className="ml-1 rounded-full px-1.5 text-xs font-bold"
                    style={{ background: "var(--red)", color: "white" }}
                  >
                    {badge}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div
                  className="glass absolute right-0 z-20 mt-2 w-[calc(100vw-1.5rem)] max-w-sm rounded-lg p-3 shadow-xl sm:w-80"
                  style={{ border: "1px solid var(--border)" }}
                >
                  {notif?.invites?.length ? (
                    <div className="mb-3">
                      <div className="mb-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
                        Invitations
                      </div>
                      {notif.invites.map((inv) => (
                        <div key={inv._id} className="card mb-2 p-2 text-sm">
                          <div className="mb-2">
                            You&apos;re invited to <b>{inv.businessName}</b>
                          </div>
                          <div className="flex gap-2">
                            <button className="btn px-2 py-1 text-xs" onClick={() => resolveInvite(inv._id, "accept")}>
                              Accept
                            </button>
                            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => resolveInvite(inv._id, "decline")}>
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mb-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
                    Recent
                  </div>
                  {notif?.recent?.length ? (
                    notif.recent.map((n) => (
                      <div key={n._id} className="border-b py-2 text-sm last:border-0" style={{ borderColor: "var(--border)" }}>
                        <div className="font-medium">{n.title}</div>
                        {n.body && <div style={{ color: "var(--muted)" }}>{n.body}</div>}
                      </div>
                    ))
                  ) : (
                    <div className="py-2 text-sm" style={{ color: "var(--muted)" }}>
                      Nothing yet.
                    </div>
                  )}
                </div>
              )}
            </div>
            <span className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: user.color }} title={user.displayName} />
              <span className="hidden sm:inline">{user.displayName}</span>
              {user.isAdmin && (
                <span className="hidden rounded px-1.5 py-0.5 text-[10px] font-bold sm:inline" style={{ background: "var(--accent)", color: "#fff" }}>
                  ADMIN
                </span>
              )}
            </span>
            <button className="btn-ghost px-2" onClick={logout} title="Sign out">
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden">⏻</span>
            </button>
          </div>
        </header>

        {user.suspended && (
          <div
            className="px-4 py-1.5 text-center text-xs font-medium"
            style={{ background: "var(--red)", color: "#fff" }}
          >
            Your account is read-only — an admin suspended it. You can view everything, and
            delete businesses you own.
          </div>
        )}

        <main className="flex-1 overflow-hidden">{children}</main>

        <footer
          className="glass flex h-11 items-center gap-2 px-3 text-xs sm:px-5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--muted)" }}>Display:</span>
          <div className="w-20">
            <select
              className="input py-1"
              value={display}
              onChange={(e) => changeCurrency(e.target.value as Currency)}
            >
              <option>USD</option>
              <option>JMD</option>
            </select>
          </div>
          <span className="ml-auto" style={{ color: "var(--muted)" }}>
            <span className="hidden sm:inline">Rate for new entries (JMD per 1 USD):</span>
            <span className="sm:hidden">Rate:</span>
          </span>
          <div className="w-24">
            <input
              className="input py-1"
              value={fxInput}
              onChange={(e) => setFxInput(e.target.value)}
            />
          </div>
          <button className="btn px-3 py-1" onClick={saveRate}>
            Save
          </button>
        </footer>

        {/* Toasts */}
        <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="w-72 cursor-pointer rounded-lg p-3 text-sm shadow-xl"
              style={{ background: "var(--accent)", color: "white" }}
              onClick={() => dismissToast(t.id)}
            >
              <div className="font-semibold">{t.title}</div>
              {t.body && <div className="mt-0.5 opacity-90">{t.body}</div>}
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}
