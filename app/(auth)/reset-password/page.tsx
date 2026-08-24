"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiFetch("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, code, new_password: password }),
    });
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.replace("/login"), 1500);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Reset failed");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-lg font-semibold">Set a new password</h2>
      {done ? (
        <p className="text-sm" style={{ color: "var(--green-text)" }}>
          Password updated. Redirecting to sign in…
        </p>
      ) : (
        <>
          {error && (
            <p className="text-sm" style={{ color: "var(--red-text)" }}>
              {error}
            </p>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Reset code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div>
            <label className="label">New password (8+)</label>
            <input className="input" type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn w-full" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </>
      )}
      <div className="text-center text-sm">
        <Link href="/login" className="hover:underline" style={{ color: "var(--muted)" }}>
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
