import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Announcements, academic calendars, admissions, staff directories, events, student achievements and alumni tools — everything a Jamaican high school needs online.",
};

const SECTIONS = [
  {
    title: "Announcements",
    body: "Post bulletins, urgent notices and school news. Pin important items to the top so they never get missed. Parents and students see updates the moment you publish.",
  },
  {
    title: "Academic calendar",
    body: "Maintain a colour-coded calendar of term dates, examinations, public and school holidays, sports days and PTA meetings — the single source of truth for your school year.",
  },
  {
    title: "Admissions information",
    body: "Keep entry requirements, the application process, fees and key dates in one always-current place, with a direct link to your application form.",
  },
  {
    title: "Staff directory",
    body: "Showcase your principal, vice-principals, deans, heads of department and teaching staff with photos, titles and short bios.",
  },
  {
    title: "Events & updates",
    body: "Promote graduations, open days, fundraisers, concerts and sports fixtures with dates, locations and images. Past events build a record of school life.",
  },
  {
    title: "Student achievements",
    body: "Celebrate CSEC and CAPE results, scholarships, national honours, and wins in sports, music, debate and the arts — a wall of pride for your school.",
  },
  {
    title: "Alumni engagement",
    body: "Let past students register, share where they are now, and reconnect. Build an alumni directory that supports mentorship, fundraising and homecoming events.",
  },
  {
    title: "Hosting, content management & maintenance",
    body: "Every plan includes managed hosting, automatic SSL, backups and ongoing maintenance, plus a simple dashboard your staff can update without any technical skills.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <p className="section-eyebrow">Features</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
        Everything your school needs to communicate online
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        SchoolHub Jamaica is purpose-built for the way Jamaican high schools
        actually work — from term calendars to alumni homecomings.
      </p>

      <div className="mt-12 space-y-8">
        {SECTIONS.map((s, i) => (
          <div key={s.title} className="flex gap-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 font-bold text-brand">
              {i + 1}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{s.title}</h2>
              <p className="mt-1 text-slate-600">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl bg-slate-900 px-8 py-12 text-center text-white">
        <h2 className="text-2xl font-bold">See it in action</h2>
        <p className="mx-auto mt-2 max-w-lg text-slate-300">
          Explore a fully-featured sample school site, then talk to us about
          launching yours.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="btn btn-accent">
            Get started
          </Link>
          <Link href="/pricing" className="btn btn-outline border-white/30 bg-white/10 text-white hover:bg-white/20">
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
