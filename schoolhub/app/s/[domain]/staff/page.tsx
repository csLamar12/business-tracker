import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/site/Section";

export default async function StaffPage({
  params,
}: {
  params: { domain: string };
}) {
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const staff = await prisma.staffMember.findMany({
    where: { schoolId: school.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Staff directory"
        subtitle="Meet the leadership and teaching staff who make our school."
      />
      <div className="mx-auto max-w-6xl px-4 py-12">
        {staff.length === 0 ? (
          <p className="text-slate-500">Staff profiles are coming soon.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((member) => (
              <div key={member.id} className="card text-center">
                {member.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.photoUrl}
                    alt={member.name}
                    className="mx-auto h-24 w-24 rounded-full object-cover"
                  />
                ) : (
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand/10 text-2xl font-bold text-brand">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                )}
                <h2 className="mt-4 font-semibold text-slate-900">
                  {member.name}
                </h2>
                <p className="text-sm font-medium text-brand">{member.title}</p>
                {member.department && (
                  <p className="text-xs text-slate-500">{member.department}</p>
                )}
                {member.bio && (
                  <p className="mt-2 text-sm text-slate-600">{member.bio}</p>
                )}
                {member.email && (
                  <a
                    href={`mailto:${member.email}`}
                    className="mt-2 inline-block text-xs text-slate-500 hover:text-brand"
                  >
                    {member.email}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
