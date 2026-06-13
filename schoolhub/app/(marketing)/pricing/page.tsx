import type { Metadata } from "next";
import Link from "next/link";
import { PLAN_INFO } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Affordable subscription plans for Jamaican high schools — a SchoolHub subdomain or your own custom domain. Hosting and maintenance included.",
};

export default function PricingPage() {
  const plans = Object.values(PLAN_INFO);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="section-eyebrow">Pricing</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
          Simple plans, built for schools
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Every plan includes managed hosting, SSL, backups and ongoing
          maintenance. Prices are billed monthly in Jamaican dollars.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`card flex flex-col ${
              plan.highlight ? "ring-2 ring-brand" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>
              {plan.highlight && (
                <span className="badge bg-brand text-white">Most popular</span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
            <p className="mt-5">
              <span className="text-4xl font-extrabold text-slate-900">
                {plan.priceJmd}
              </span>
              <span className="text-slate-500"> JMD{plan.period}</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/contact?plan=${plan.id}`}
              className={`btn mt-7 ${plan.highlight ? "btn-primary" : "btn-outline"}`}
            >
              Choose {plan.name}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-slate-500">
        Need something custom — multiple campuses, a parent portal, or data
        migration?{" "}
        <Link href="/contact" className="font-medium text-brand underline">
          Talk to us
        </Link>
        .
      </p>

      {/* FAQ */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold text-slate-900">
          Frequently asked questions
        </h2>
        <div className="mt-8 space-y-6">
          {[
            {
              q: "What's the difference between the plans?",
              a: "Standard gives your school a polished site on a SchoolHub subdomain (yourschool.schoolhubja.com). Premium adds your own custom domain (e.g. www.yourschool.edu.jm) plus extra branding and priority updates.",
            },
            {
              q: "Can we use our existing school domain?",
              a: "Yes — on the Premium plan you can connect a domain you already own. We'll guide you through the simple DNS setup.",
            },
            {
              q: "Do we need any technical staff?",
              a: "No. We handle hosting and maintenance, and your team updates content through a simple dashboard. We provide onboarding and training.",
            },
            {
              q: "Can we upgrade later?",
              a: "Absolutely. Start on a subdomain and move to your own custom domain whenever you're ready — your content comes with you.",
            },
          ].map((item) => (
            <div key={item.q} className="card">
              <h3 className="font-semibold text-slate-900">{item.q}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
