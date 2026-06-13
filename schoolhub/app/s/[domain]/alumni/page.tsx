import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/site/Section";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { registerAlumni } from "./actions";

export default async function AlumniPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ joined?: string; error?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const school = await getSchoolByDomainParam(params.domain);
  if (!school) notFound();

  const alumni = await prisma.alumniProfile.findMany({
    where: { schoolId: school.id, approved: true },
    orderBy: [{ gradYear: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Alumni"
        subtitle={`Reconnect with ${school.name} and stay part of our community.`}
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 lg:grid-cols-2">
        {/* Registration */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Register as an alumnus
          </h2>
          <p className="mt-2 text-slate-600">
            Tell us where you are now. Once approved, you'll appear in our alumni
            directory and hear about reunions and ways to give back.
          </p>

          {searchParams.joined === "1" ? (
            <div className="mt-6 rounded-lg bg-green-50 p-6">
              <p className="font-semibold text-slate-900">
                Thank you for registering! 🎓
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Your details have been submitted and will appear once an
                administrator approves them.
              </p>
            </div>
          ) : (
            <form action={registerAlumni} className="mt-6 space-y-4">
              <input type="hidden" name="schoolId" value={school.id} />
              {searchParams.error === "1" && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  Please check your details and try again.
                </p>
              )}
              <Field label="Full name" htmlFor="name" required>
                <input id="name" name="name" className="input" required />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Graduation year" htmlFor="gradYear">
                  <input
                    id="gradYear"
                    name="gradYear"
                    className="input"
                    placeholder="2010"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Email" htmlFor="email">
                  <input id="email" name="email" type="email" className="input" />
                </Field>
              </div>
              <Field label="What are you doing now?" htmlFor="currentRole">
                <input
                  id="currentRole"
                  name="currentRole"
                  className="input"
                  placeholder="e.g. Software Engineer at ..."
                />
              </Field>
              <Field label="Message (optional)" htmlFor="message">
                <textarea id="message" name="message" className="textarea" />
              </Field>
              <SubmitButton className="btn btn-primary" pendingText="Submitting…">
                Register
              </SubmitButton>
            </form>
          )}
        </div>

        {/* Directory */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Alumni directory</h2>
          {alumni.length === 0 ? (
            <p className="mt-3 text-slate-500">
              Be the first to join our alumni directory!
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {alumni.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{a.name}</p>
                    {a.currentRole && (
                      <p className="text-sm text-slate-600">{a.currentRole}</p>
                    )}
                    {a.message && (
                      <p className="mt-1 text-sm italic text-slate-500">
                        “{a.message}”
                      </p>
                    )}
                  </div>
                  {a.gradYear && (
                    <span className="badge bg-brand/10 text-brand">
                      Class of {a.gradYear}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
