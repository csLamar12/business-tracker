import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { SectionTitle } from "@/components/site/Section";
import { formatDate, formatDateRange } from "@/lib/format";

const QUICK_LINKS = [
  { href: "/admissions", label: "Admissions", icon: "🎓" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/events", label: "Events", icon: "🎉" },
  { href: "/achievements", label: "Achievements", icon: "🏆" },
  { href: "/staff", label: "Staff", icon: "👩🏽‍🏫" },
  { href: "/alumni", label: "Alumni", icon: "🤝" },
];

export default async function SchoolHome({
  params,
}: {
  params: { domain: string };
}) {
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const now = new Date();
  const [announcements, events, achievements] = await Promise.all([
    prisma.announcement.findMany({
      where: { schoolId: school.id, published: true },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 4,
    }),
    prisma.event.findMany({
      where: { schoolId: school.id, published: true, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 3,
    }),
    prisma.achievement.findMany({
      where: { schoolId: school.id },
      orderBy: { achievedOn: "desc" },
      take: 3,
    }),
  ]);

  return (
    <>
      {/* Hero */}
      <section
        className="relative text-white"
        style={
          school.heroImageUrl
            ? {
                backgroundImage: `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url(${school.heroImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : { background: "var(--brand-primary)" }
        }
      >
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            {school.name}
          </h1>
          {school.tagline && (
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">
              {school.tagline}
            </p>
          )}
          {school.motto && (
            <p className="mt-3 text-sm uppercase tracking-widest text-white/70">
              {school.motto}
            </p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/admissions" className="btn btn-accent">
              Admissions
            </Link>
            <Link
              href="/announcements"
              className="btn btn-outline border-white/40 bg-white/10 text-white hover:bg-white/20"
            >
              Latest news
            </Link>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 px-4 py-6 sm:grid-cols-6">
          {QUICK_LINKS.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="flex flex-col items-center gap-1 rounded-lg p-3 text-center transition hover:bg-slate-50"
            >
              <span className="text-2xl">{q.icon}</span>
              <span className="text-xs font-medium text-slate-700">
                {q.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-12 lg:grid-cols-3">
          {/* Announcements */}
          <div className="lg:col-span-2">
            <SectionTitle title="Latest announcements" href="/announcements" />
            {announcements.length === 0 ? (
              <p className="text-sm text-slate-500">No announcements yet.</p>
            ) : (
              <div className="space-y-4">
                {announcements.map((a) => (
                  <article
                    key={a.id}
                    className="rounded-xl border border-slate-200 p-5"
                  >
                    <div className="flex items-center gap-2">
                      {a.pinned && (
                        <span className="badge bg-brand-accent text-slate-900">
                          📌 Pinned
                        </span>
                      )}
                      <time className="text-xs text-slate-500">
                        {formatDate(a.publishedAt)}
                      </time>
                    </div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {a.title}
                    </h3>
                    <p className="mt-1 line-clamp-3 text-sm text-slate-600">
                      {a.body}
                    </p>
                  </article>
                ))}
              </div>
            )}

            {/* About snippet */}
            {school.aboutHtml && (
              <div className="mt-12">
                <SectionTitle title={`About ${school.name}`} />
                <div
                  className="prose-lite text-slate-700"
                  dangerouslySetInnerHTML={{ __html: school.aboutHtml }}
                />
              </div>
            )}
          </div>

          {/* Sidebar: events + achievements */}
          <aside className="space-y-10">
            <div>
              <SectionTitle title="Upcoming events" href="/events" />
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming events.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-lg border border-slate-200 p-4"
                    >
                      <p className="text-xs font-semibold uppercase text-brand">
                        {formatDate(e.startsAt)}
                      </p>
                      <p className="font-medium text-slate-900">{e.title}</p>
                      {e.location && (
                        <p className="text-sm text-slate-500">📍 {e.location}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <SectionTitle title="Recent achievements" href="/achievements" />
              {achievements.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing here yet.</p>
              ) : (
                <ul className="space-y-3">
                  {achievements.map((a) => (
                    <li key={a.id} className="rounded-lg bg-slate-50 p-4">
                      <p className="font-medium text-slate-900">{a.title}</p>
                      {a.studentName && (
                        <p className="text-sm text-slate-600">{a.studentName}</p>
                      )}
                      {a.achievedOn && (
                        <p className="text-xs text-slate-400">
                          {formatDate(a.achievedOn)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
