"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiFetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.replace("/welcome");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Sign up failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-lg font-semibold">Create account</h2>
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
        <label className="label">Password (8+ characters)</label>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <button className="btn w-full" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
      <div className="text-center text-sm">
        <Link href="/login" className="hover:underline" style={{ color: "var(--muted)" }}>
          Already have an account? Sign in
        </Link>
      </div>
    </form>
  );
}
