import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ApexLink } from "@/components/ui/ApexLink";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-lg">
          <Logo />
        </div>
        <div className="card">
          <h1 className="text-xl font-bold text-slate-900">School sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your school's website content.
          </p>
          <form action={login} className="mt-6 space-y-4">
            {searchParams.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Incorrect email or password.
              </p>
            )}
            <Field label="Email" htmlFor="email" required>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                className="input"
                required
              />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="input"
                required
              />
            </Field>
            <SubmitButton className="btn btn-primary w-full" pendingText="Signing in…">
              Sign in
            </SubmitButton>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Need a website for your school?{" "}
          <ApexLink className="font-medium text-brand underline">
            Learn about SchoolHub Jamaica
          </ApexLink>
        </p>
      </div>
    </div>
  );
}
