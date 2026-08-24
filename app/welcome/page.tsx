"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, jsonFetcher } from "@/lib/apiClient";
import type { PublicUser } from "@/lib/types";

export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    jsonFetcher<{ user: PublicUser }>("/api/users/me")
      .then(({ user }) => {
        if (user.displayNameSet) router.replace("/");
        else setName(user.displayName);
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiFetch("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: name }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not save name");
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Choose your display name</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            This is how teammates see you and @mention you. It must be unique.
          </p>
        </div>
        {error && (
          <p className="text-sm" style={{ color: "var(--red-text)" }}>
            {error}
          </p>
        )}
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          required
          autoFocus
        />
        <button className="btn w-full" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
