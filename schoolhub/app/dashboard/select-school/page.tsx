import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/ui/Logo";
import { setActiveSchool, logout } from "../actions";

export default async function SelectSchoolPage() {
  const session = await requireSession();

  // School-bound admins never need to pick.
  if (session.schoolId) redirect("/");

  const schools = await prisma.school.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <form action={logout}>
            <button className="btn btn-outline btn-sm">Sign out</button>
          </form>
        </div>
        <div className="card">
          <h1 className="text-xl font-bold text-slate-900">
            Choose a school to manage
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            You're signed in as a platform administrator.
          </p>

          {schools.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              No schools yet. Seed the database or add one.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-slate-100">
              {schools.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.subdomain} · {s.plan}
                      {s.published ? "" : " · unpublished"}
                    </p>
                  </div>
                  <form action={setActiveSchool}>
                    <input type="hidden" name="schoolId" value={s.id} />
                    <button className="btn btn-primary btn-sm">Manage</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
