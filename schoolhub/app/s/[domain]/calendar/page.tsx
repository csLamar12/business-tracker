import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/site/Section";
import { formatDateRange } from "@/lib/format";
import {
  CALENDAR_CATEGORY_COLORS,
  CALENDAR_CATEGORY_LABELS,
  type CalendarCategory,
} from "@/lib/constants";

function categoryOf(value: string): CalendarCategory {
  return (value in CALENDAR_CATEGORY_LABELS
    ? value
    : "OTHER") as CalendarCategory;
}

export default async function CalendarPage({
  params,
}: {
  params: { domain: string };
}) {
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const entries = await prisma.calendarEntry.findMany({
    where: { schoolId: school.id },
    orderBy: { startDate: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Academic calendar"
        subtitle="Term dates, examinations, holidays and key events for the school year."
      />
      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* Legend */}
        <div className="mb-8 flex flex-wrap gap-3">
          {Object.entries(CALENDAR_CATEGORY_LABELS).map(([key, label]) => (
            <span key={key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor:
                    CALENDAR_CATEGORY_COLORS[key as CalendarCategory],
                }}
              />
              {label}
            </span>
          ))}
        </div>

        {entries.length === 0 ? (
          <p className="text-slate-500">The calendar is being prepared.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => {
              const cat = categoryOf(e.category);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-4 rounded-xl border border-slate-200 p-4"
                  style={{
                    borderLeftColor: CALENDAR_CATEGORY_COLORS[cat],
                    borderLeftWidth: 4,
                  }}
                >
                  <div className="min-w-[140px] shrink-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatDateRange(e.startDate, e.endDate)}
                    </p>
                    <span
                      className="badge mt-1"
                      style={{
                        backgroundColor: `${CALENDAR_CATEGORY_COLORS[cat]}1a`,
                        color: CALENDAR_CATEGORY_COLORS[cat],
                      }}
                    >
                      {CALENDAR_CATEGORY_LABELS[cat]}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{e.title}</p>
                    {e.description && (
                      <p className="text-sm text-slate-600">{e.description}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
