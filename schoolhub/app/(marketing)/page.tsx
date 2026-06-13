import Link from "next/link";
import { SubdomainLink } from "@/components/marketing/SubdomainLink";
import { PLAN_INFO } from "@/lib/constants";

const FEATURES = [
  {
    title: "Announcements & news",
    body: "Publish bulletins, urgent notices and news that parents and students actually see.",
    icon: "📣",
  },
  {
    title: "Academic calendar",
    body: "Term dates, exams, holidays, sports days and PTA meetings in one shared calendar.",
    icon: "📅",
  },
  {
    title: "Admissions information",
    body: "Requirements, process, fees and application links — kept current, all year round.",
    icon: "🎓",
  },
  {
    title: "Staff directory",
    body: "Introduce your principal, deans, heads of department and teaching staff.",
    icon: "👩🏽‍🏫",
  },
  {
    title: "Events & updates",
    body: "Promote graduations, fundraisers, open days and sports fixtures with details and dates.",
    icon: "🎉",
  },
  {
    title: "Student achievements",
    body: "Celebrate CSEC/CAPE results, scholarships, sports and arts wins across the school.",
    icon: "🏆",
  },
  {
    title: "Alumni engagement",
    body: "Let past students register, reconnect and stay involved with their alma mater.",
    icon: "🤝",
  },
  {
    title: "Hosting & maintenance",
    body: "We handle hosting, SSL, backups and updates — so your team can focus on teaching.",
    icon: "🛠️",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0a4d8c] to-[#06365f] text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2 md:py-28">
          <div>
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
              For Jamaican high schools
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              A professional website for your school —{" "}
              <span className="text-amber-400">without the headache.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-blue-100">
              SchoolHub Jamaica gives your school a modern, easy-to-manage
              website with announcements, calendars, admissions, staff, events,
              achievements and alumni tools. Choose a free subdomain or connect
              your own custom domain.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="btn btn-accent">
                Get your school online
              </Link>
              <SubdomainLink
                subdomain="kingston-college"
                className="btn btn-outline border-white/30 bg-white/10 text-white hover:bg-white/20"
              >
                See a live demo →
              </SubdomainLink>
            </div>
            <p className="mt-4 text-sm text-blue-200">
              No technical skills needed · Managed hosting included
            </p>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-1.5 px-2 pb-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-3 truncate text-xs text-blue-200">
                  kingston-college.schoolhubja.com
                </span>
              </div>
              <div className="space-y-3 rounded-xl bg-white p-4 text-slate-900">
                <div className="h-24 rounded-lg bg-gradient-to-r from-[#5b2a86] to-[#9b59b6]" />
                <div className="h-3 w-2/3 rounded bg-slate-200" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-16 rounded-lg bg-slate-100" />
                  <div className="h-16 rounded-lg bg-slate-100" />
                  <div className="h-16 rounded-lg bg-slate-100" />
                </div>
                <div className="h-3 w-1/2 rounded bg-slate-200" />
                <div className="h-3 w-3/4 rounded bg-slate-100" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">Everything your school needs</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            One platform for your whole school community
          </h2>
          <p className="mt-3 text-slate-600">
            Modernize communication between your school, students, parents,
            alumni and the wider community.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-eyebrow">How it works</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Online in three simple steps
            </h2>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                n: "1",
                t: "Tell us about your school",
                d: "Send us your school's name, colours and logo. We set up your site and admin login.",
              },
              {
                n: "2",
                t: "Add your content",
                d: "Use the simple dashboard to add announcements, staff, events and more — no coding.",
              },
              {
                n: "3",
                t: "Go live",
                d: "Launch on a SchoolHub subdomain or connect your own custom domain. We host & maintain it.",
              },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans teaser */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">Simple, affordable plans</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Subdomain or your own custom domain
          </h2>
        </div>
        <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-2">
          {Object.values(PLAN_INFO).map((plan) => (
            <div
              key={plan.id}
              className={`card flex flex-col ${
                plan.highlight ? "ring-2 ring-brand" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                {plan.highlight && (
                  <span className="badge bg-brand text-white">Most popular</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
              <p className="mt-4">
                <span className="text-3xl font-extrabold text-slate-900">
                  {plan.priceJmd}
                </span>
                <span className="text-sm text-slate-500"> JMD{plan.period}</span>
              </p>
              <Link href="/pricing" className="btn btn-outline mt-6">
                Compare plans
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center text-white">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
            Ready to bring your school online?
          </h2>
          <p className="max-w-xl text-blue-100">
            Join Jamaican high schools building a stronger connection with their
            students, parents and alumni.
          </p>
          <Link href="/contact" className="btn btn-accent">
            Get started today
          </Link>
        </div>
      </section>
    </>
  );
}
