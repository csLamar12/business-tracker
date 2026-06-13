import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/site/Section";
import { formatDate } from "@/lib/format";

export default async function AnnouncementsPage({
  params,
}: {
  params: { domain: string };
}) {
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const announcements = await prisma.announcement.findMany({
    where: { schoolId: school.id, published: true },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="News, bulletins and notices for our school community."
      />
      <div className="mx-auto max-w-3xl px-4 py-12">
        {announcements.length === 0 ? (
          <p className="text-slate-500">No announcements have been posted yet.</p>
        ) : (
          <div className="space-y-6">
            {announcements.map((a) => (
              <article
                key={a.id}
                className="rounded-xl border border-slate-200 p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {a.pinned && (
                    <span className="badge bg-brand-accent text-slate-900">
                      📌 Pinned
                    </span>
                  )}
                  <time className="text-sm text-slate-500">
                    {formatDate(a.publishedAt)}
                  </time>
                </div>
                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  {a.title}
                </h2>
                <p className="mt-2 whitespace-pre-line text-slate-700">
                  {a.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
