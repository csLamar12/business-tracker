import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { EmptyState } from "@/components/ui/Field";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatDate } from "@/lib/format";
import { approveAlumni, unapproveAlumni, deleteAlumni } from "./actions";

function AlumniRow({
  a,
}: {
  a: {
    id: string;
    name: string;
    gradYear: number | null;
    email: string | null;
    currentRole: string | null;
    message: string | null;
    approved: boolean;
    createdAt: Date;
  };
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <p className="font-medium text-slate-900">
          {a.name}
          {a.gradYear ? (
            <span className="ml-2 text-sm font-normal text-slate-500">
              Class of {a.gradYear}
            </span>
          ) : null}
        </p>
        {a.currentRole && (
          <p className="text-sm text-slate-600">{a.currentRole}</p>
        )}
        {a.email && <p className="text-xs text-slate-400">{a.email}</p>}
        {a.message && (
          <p className="mt-1 text-sm italic text-slate-500">“{a.message}”</p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          Registered {formatDate(a.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {a.approved ? (
          <form action={unapproveAlumni}>
            <input type="hidden" name="id" value={a.id} />
            <button className="btn btn-outline btn-sm">Hide</button>
          </form>
        ) : (
          <form action={approveAlumni}>
            <input type="hidden" name="id" value={a.id} />
            <button className="btn btn-primary btn-sm">Approve</button>
          </form>
        )}
        <DeleteButton
          action={deleteAlumni}
          id={a.id}
          confirmText="Delete this alumni registration?"
        />
      </div>
    </div>
  );
}

export default async function ManageAlumni() {
  const school = await requireActiveSchool();

  const [pending, approved] = await Promise.all([
    prisma.alumniProfile.findMany({
      where: { schoolId: school.id, approved: false },
      orderBy: { createdAt: "desc" },
    }),
    prisma.alumniProfile.findMany({
      where: { schoolId: school.id, approved: true },
      orderBy: [{ gradYear: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <>
      <PageTitle
        title="Alumni"
        description="Review registrations and manage your alumni directory."
      />

      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          Awaiting approval
          {pending.length > 0 && (
            <span className="badge bg-amber-100 text-amber-800">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No registrations to review.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((a) => (
              <AlumniRow key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">
          Published alumni ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <EmptyState
            title="No published alumni yet"
            description="Approved registrations appear on your public alumni page."
          />
        ) : (
          <div className="space-y-2">
            {approved.map((a) => (
              <AlumniRow key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
