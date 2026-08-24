"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Login failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-lg font-semibold">Sign in</h2>
      {error && (
        <p className="text-sm" style={{ color: "var(--red-text)" }}>
          {error}
        </p>
      )}
      <div>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Password</label>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button className="btn w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="hover:underline" style={{ color: "var(--muted)" }}>
          Forgot password?
        </Link>
        <Link href="/signup" className="hover:underline" style={{ color: "var(--accent)" }}>
          Create account
        </Link>
      </div>
    </form>
  );
}
