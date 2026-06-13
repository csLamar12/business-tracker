import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/site/Section";
import { formatDate } from "@/lib/format";

function Block({ title, html }: { title: string; html?: string | null }) {
  if (!html) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <div
        className="prose-lite mt-2 text-slate-700"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}

export default async function AdmissionsPage({
  params: paramsPromise,
}: {
  params: Promise<{ domain: string }>;
}) {
  const params = await paramsPromise;
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const info = await prisma.admissionsInfo.findUnique({
    where: { schoolId: school.id },
  });

  return (
    <>
      <PageHeader
        title="Admissions"
        subtitle={`How to join the ${school.name} community.`}
      />
      <div className="mx-auto max-w-3xl px-4 py-12">
        {!info ? (
          <p className="text-slate-500">
            Admissions information will be published here soon. Please contact
            the school office for details.
          </p>
        ) : (
          <>
            {(info.opensOn || info.closesOn) && (
              <div className="flex flex-wrap gap-3">
                {info.opensOn && (
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase text-slate-500">Opens</p>
                    <p className="font-semibold text-slate-900">
                      {formatDate(info.opensOn)}
                    </p>
                  </div>
                )}
                {info.closesOn && (
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase text-slate-500">Closes</p>
                    <p className="font-semibold text-slate-900">
                      {formatDate(info.closesOn)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {info.introHtml && (
              <div
                className="prose-lite mt-8 text-slate-700"
                dangerouslySetInnerHTML={{ __html: info.introHtml }}
              />
            )}
            <Block title="Entry requirements" html={info.requirementsHtml} />
            <Block title="Application process" html={info.processHtml} />
            <Block title="Fees" html={info.feesHtml} />

            {info.applyUrl && (
              <div className="mt-10">
                <a
                  href={info.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Start your application →
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
