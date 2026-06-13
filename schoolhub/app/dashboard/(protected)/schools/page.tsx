import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { ROOT_DOMAIN } from "@/lib/utils";
import { PLANS, PLAN_INFO } from "@/lib/constants";
import { setActiveSchool } from "../../actions";
import { createSchool, deleteSchool } from "./actions";

export default async function ManageSchools({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ new?: string; created?: string; error?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const session = await getSession();
  if (session?.role !== "SUPERADMIN") redirect("/");

  const adding = searchParams.new !== undefined;
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <>
      <PageTitle
        title="All schools"
        description="Every school on the SchoolHub Jamaica platform."
        action={
          adding ? (
            <Link href="/schools" className="btn btn-outline btn-sm">
              Cancel
            </Link>
          ) : (
            <Link href="?new" className="btn btn-primary btn-sm">
              + Onboard a school
            </Link>
          )
        }
      />

      {searchParams.created === "1" && (
        <p className="mb-6 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          School created. It starts unpublished — set its details, then publish
          from the school's Settings.
        </p>
      )}
      {searchParams.error && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      {adding && (
        <form action={createSchool} className="card mb-8 space-y-4">
          <h2 className="font-semibold text-slate-900">Onboard a new school</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School name" htmlFor="name" required>
              <input id="name" name="name" className="input" required />
            </Field>
            <Field
              label="Subdomain"
              htmlFor="subdomain"
              hint={`Defaults to a slug of the name. .${ROOT_DOMAIN}`}
            >
              <input id="subdomain" name="subdomain" className="input" />
            </Field>
          </div>
          <Field label="Plan" htmlFor="plan" required>
            <select id="plan" name="plan" className="select" defaultValue="STANDARD">
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {PLAN_INFO[p].name}
                </option>
              ))}
            </select>
          </Field>
          <hr className="border-slate-100" />
          <h3 className="text-sm font-semibold text-slate-700">
            School administrator login
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin name" htmlFor="adminName" required>
              <input id="adminName" name="adminName" className="input" required />
            </Field>
            <Field label="Admin email" htmlFor="adminEmail" required>
              <input
                id="adminEmail"
                name="adminEmail"
                type="email"
                className="input"
                required
              />
            </Field>
          </div>
          <Field
            label="Temporary password"
            htmlFor="adminPassword"
            hint="At least 8 characters. Share securely with the school."
            required
          >
            <input
              id="adminPassword"
              name="adminPassword"
              className="input"
              minLength={8}
              required
            />
          </Field>
          <SubmitButton>Create school</SubmitButton>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">School</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schools.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-400">
                    {s._count.users} admin
                    {s._count.users === 1 ? "" : "s"}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.plan === "PREMIUM" && s.customDomain
                    ? s.customDomain
                    : `${s.subdomain}.${ROOT_DOMAIN}`}
                </td>
                <td className="px-4 py-3">
                  <span className="badge bg-brand/10 text-brand">{s.plan}</span>
                </td>
                <td className="px-4 py-3">
                  {s.published ? (
                    <span className="badge bg-green-100 text-green-700">
                      Published
                    </span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-500">
                      Draft
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <form action={setActiveSchool}>
                      <input type="hidden" name="schoolId" value={s.id} />
                      <button className="btn btn-outline btn-sm">Manage</button>
                    </form>
                    <DeleteButton
                      action={deleteSchool}
                      id={s.id}
                      confirmText={`Delete ${s.name} and all its content? This cannot be undone.`}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
