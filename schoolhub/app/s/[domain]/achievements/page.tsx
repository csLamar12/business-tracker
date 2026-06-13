import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/site/Section";
import { formatDate } from "@/lib/format";

export default async function AchievementsPage({
  params: paramsPromise,
}: {
  params: Promise<{ domain: string }>;
}) {
  const params = await paramsPromise;
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const achievements = await prisma.achievement.findMany({
    where: { schoolId: school.id },
    orderBy: { achievedOn: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Student achievements"
        subtitle="Celebrating excellence across academics, sports, arts and service."
      />
      <div className="mx-auto max-w-6xl px-4 py-12">
        {achievements.length === 0 ? (
          <p className="text-slate-500">Achievements will be featured here.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((a) => (
              <article
                key={a.id}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                {a.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.imageUrl}
                    alt={a.title}
                    className="h-44 w-full object-cover"
                  />
                )}
                <div className="p-5">
                  {a.category && (
                    <span className="badge bg-brand/10 text-brand">
                      {a.category}
                    </span>
                  )}
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">
                    {a.title}
                  </h2>
                  {a.studentName && (
                    <p className="text-sm font-medium text-slate-700">
                      {a.studentName}
                    </p>
                  )}
                  {a.achievedOn && (
                    <p className="text-xs text-slate-400">
                      {formatDate(a.achievedOn)}
                    </p>
                  )}
                  {a.description && (
                    <p className="mt-2 text-sm text-slate-600">
                      {a.description}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
