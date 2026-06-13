import type { Metadata } from "next";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PLAN_INFO, PLANS, type Plan } from "@/lib/constants";
import { submitContact } from "./actions";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with SchoolHub Jamaica to bring your high school online.",
};

export default function ContactPage({
  searchParams,
}: {
  searchParams: { plan?: string; sent?: string; error?: string };
}) {
  const sent = searchParams.sent === "1";
  const error = searchParams.error;
  const selectedPlan = PLANS.includes(searchParams.plan as Plan)
    ? (searchParams.plan as Plan)
    : undefined;

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-16 md:grid-cols-2">
      <div>
        <p className="section-eyebrow">Contact</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
          Let's get your school online
        </h1>
        <p className="mt-4 text-slate-600">
          Tell us a little about your school and which plan interests you. We'll
          reach out to set up your site, admin login and onboarding.
        </p>
        <dl className="mt-8 space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-slate-900">Email</dt>
            <dd className="text-slate-600">hello@schoolhubja.com</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Where we are</dt>
            <dd className="text-slate-600">Kingston, Jamaica</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Plans</dt>
            <dd className="text-slate-600">
              {PLAN_INFO.STANDARD.name} {PLAN_INFO.STANDARD.priceJmd} JMD/mo ·{" "}
              {PLAN_INFO.PREMIUM.name} {PLAN_INFO.PREMIUM.priceJmd} JMD/mo
            </dd>
          </div>
        </dl>
      </div>

      <div className="card">
        {sent ? (
          <div className="rounded-lg bg-green-50 p-6 text-center">
            <div className="text-3xl">✅</div>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              Thank you!
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              We've received your enquiry and will be in touch shortly at the
              email you provided.
            </p>
            <a href="/contact" className="btn btn-outline mt-4">
              Send another message
            </a>
          </div>
        ) : (
          <form action={submitContact} className="space-y-4">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Field label="Your name" htmlFor="name" required>
              <input id="name" name="name" className="input" required />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                required
              />
            </Field>
            <Field label="School name" htmlFor="schoolName">
              <input id="schoolName" name="schoolName" className="input" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <input id="phone" name="phone" className="input" />
            </Field>
            <Field label="Plan you're interested in" htmlFor="plan">
              <select
                id="plan"
                name="plan"
                className="select"
                defaultValue={selectedPlan ?? ""}
              >
                <option value="">No preference yet</option>
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_INFO[p].name} — {PLAN_INFO[p].priceJmd} JMD/mo
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tell us about your school" htmlFor="message" required>
              <textarea
                id="message"
                name="message"
                className="textarea"
                required
                placeholder="School size, location, and what you'd like your website to do…"
              />
            </Field>
            <SubmitButton className="btn btn-primary w-full" pendingText="Sending…">
              Send enquiry
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
