"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  // The welcome email links here with the code (and address) attached, so an
  // invited user lands on a form that is already filled in — an email can't run
  // script, so carrying the code on the link is what "copies it for them".
  // Held in state, not derived per-render: the effect below strips the query so
  // the code doesn't linger in the address bar, which would otherwise flip this
  // back to false and swap the onboarding copy out mid-session.
  const [welcome, setWelcome] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    const c = params.get("code") || "";
    const e = params.get("email") || "";
    if (params.get("welcome") === "1") setWelcome(true);
    if (c) setCode(c);
    if (e) setEmail(e);
    if (c || e) setPrefilled(true);
    // Drop the code from the address bar once it's in the form: it has served
    // its purpose, and this keeps it out of a shared screenshot or the URL the
    // user might copy to someone else.
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [params]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
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
      <div>
        <h2 className="text-lg font-semibold">
          {welcome ? "Welcome — choose your password" : "Set a new password"}
        </h2>
        {welcome && !done && (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Pick a password and you&apos;re in. At least 8 characters, with one
            capital letter and one number.
          </p>
        )}
      </div>

      {done ? (
        <p className="text-sm" style={{ color: "var(--green-text)" }}>
          {welcome ? "You're all set. Taking you to sign in…" : "Password updated. Redirecting to sign in…"}
        </p>
      ) : (
        <>
          {error && (
            <p className="text-sm" style={{ color: "var(--red-text)" }}>
              {error}
            </p>
          )}
          {prefilled && (
            <p className="text-sm" style={{ color: "var(--green-text)" }}>
              Your code was filled in from the email — just pick a password below.
            </p>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">{welcome ? "Setup code" : "Reset code"}</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div>
            <label className="label">{welcome ? "Choose a password (8+)" : "New password (8+)"}</label>
            <input className="input" type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn w-full" disabled={busy}>
            {busy ? "Saving…" : welcome ? "Create my password" : "Update password"}
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

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<div className="card text-sm">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
