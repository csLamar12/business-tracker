import Link from "next/link";
import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";

export default async function DashboardOverview() {
  const school = await requireActiveSchool();

  const [
    announcements,
    events,
    calendar,
    staff,
    achievements,
    alumniPending,
  ] = await Promise.all([
    prisma.announcement.count({ where: { schoolId: school.id } }),
    prisma.event.count({ where: { schoolId: school.id } }),
    prisma.calendarEntry.count({ where: { schoolId: school.id } }),
    prisma.staffMember.count({ where: { schoolId: school.id } }),
    prisma.achievement.count({ where: { schoolId: school.id } }),
    prisma.alumniProfile.count({
      where: { schoolId: school.id, approved: false },
    }),
  ]);

  const stats = [
    { label: "Announcements", value: announcements, href: "/announcements" },
    { label: "Events", value: events, href: "/events" },
    { label: "Calendar entries", value: calendar, href: "/calendar" },
    { label: "Staff", value: staff, href: "/staff" },
    { label: "Achievements", value: achievements, href: "/achievements" },
    { label: "Alumni awaiting approval", value: alumniPending, href: "/alumni" },
  ];

  return (
    <>
      <PageTitle
        title={`Welcome back`}
        description={`Here's an overview of ${school.name}.`}
      />

      {!school.published && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your site is currently <strong>unpublished</strong> — visitors can't
          see it yet. Publish it from{" "}
          <Link href="/settings" className="font-semibold underline">
            Settings
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="card transition hover:border-brand hover:shadow"
          >
            <p className="text-3xl font-extrabold text-slate-900">{s.value}</p>
            <p className="mt-1 text-sm text-slate-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 card">
        <h2 className="font-semibold text-slate-900">Quick actions</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/announcements?edit=new" className="btn btn-primary btn-sm">
            + New announcement
          </Link>
          <Link href="/events?edit=new" className="btn btn-outline btn-sm">
            + New event
          </Link>
          <Link href="/achievements?edit=new" className="btn btn-outline btn-sm">
            + New achievement
          </Link>
          <Link href="/settings" className="btn btn-outline btn-sm">
            Edit school details
          </Link>
        </div>
      </div>
    </>
  );
}
