"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await apiFetch("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(body.message || "Check your email for a reset code.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-lg font-semibold">Reset password</h2>
      {msg ? (
        <p className="text-sm" style={{ color: "var(--green-text)" }}>
          {msg}
        </p>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Enter your email and we&apos;ll send a 6-digit reset code.
        </p>
      )}
      <div>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <button className="btn w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset code"}
      </button>
      <div className="flex justify-between text-sm">
        <Link href="/login" className="hover:underline" style={{ color: "var(--muted)" }}>
          Back to sign in
        </Link>
        <Link href="/reset-password" className="hover:underline" style={{ color: "var(--accent)" }}>
          I have a code
        </Link>
      </div>
    </form>
  );
}
