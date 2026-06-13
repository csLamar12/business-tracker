import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/site/Section";
import { formatDateTime } from "@/lib/format";

function EventCard({
  event,
  past = false,
}: {
  event: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: Date;
    imageUrl: string | null;
  };
  past?: boolean;
}) {
  return (
    <article
      className={`overflow-hidden rounded-xl border border-slate-200 ${
        past ? "opacity-80" : ""
      }`}
    >
      {event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt={event.title}
          className="h-40 w-full object-cover"
        />
      )}
      <div className="p-5">
        <p className="text-xs font-semibold uppercase text-brand">
          {formatDateTime(event.startsAt)}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">
          {event.title}
        </h3>
        {event.location && (
          <p className="text-sm text-slate-500">📍 {event.location}</p>
        )}
        {event.description && (
          <p className="mt-2 text-sm text-slate-600">{event.description}</p>
        )}
      </div>
    </article>
  );
}

export default async function EventsPage({
  params,
}: {
  params: { domain: string };
}) {
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({
      where: { schoolId: school.id, published: true, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.event.findMany({
      where: { schoolId: school.id, published: true, startsAt: { lt: now } },
      orderBy: { startsAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Open days, graduations, fundraisers, sports fixtures and more."
      />
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-bold text-slate-900">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-slate-500">No upcoming events scheduled.</p>
        ) : (
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}

        {past.length > 0 && (
          <>
            <h2 className="mt-14 text-2xl font-bold text-slate-900">
              Past events
            </h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((e) => (
                <EventCard key={e.id} event={e} past />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
