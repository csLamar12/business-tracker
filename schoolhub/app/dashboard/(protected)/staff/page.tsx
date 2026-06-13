import Link from "next/link";
import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field, EmptyState } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { saveStaff, deleteStaff } from "./actions";

export default async function ManageStaff({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const school = await requireActiveSchool();
  const editing = searchParams.edit;
  const record =
    editing && editing !== "new"
      ? await prisma.staffMember.findFirst({
          where: { id: editing, schoolId: school.id },
        })
      : null;

  const staff = await prisma.staffMember.findMany({
    where: { schoolId: school.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageTitle
        title="Staff directory"
        description="Introduce your leadership and teaching staff."
        action={
          !editing ? (
            <Link href="?edit=new" className="btn btn-primary btn-sm">
              + Add staff member
            </Link>
          ) : (
            <Link href="/staff" className="btn btn-outline btn-sm">
              Cancel
            </Link>
          )
        }
      />

      {editing && (
        <form action={saveStaff} className="card mb-8 space-y-4">
          <h2 className="font-semibold text-slate-900">
            {record ? "Edit staff member" : "New staff member"}
          </h2>
          {record && <input type="hidden" name="id" value={record.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <input
                id="name"
                name="name"
                className="input"
                defaultValue={record?.name ?? ""}
                required
              />
            </Field>
            <Field label="Title / role" htmlFor="title" required>
              <input
                id="title"
                name="title"
                className="input"
                placeholder="e.g. Principal"
                defaultValue={record?.title ?? ""}
                required
              />
            </Field>
            <Field label="Department" htmlFor="department">
              <input
                id="department"
                name="department"
                className="input"
                defaultValue={record?.department ?? ""}
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                defaultValue={record?.email ?? ""}
              />
            </Field>
          </div>
          <Field label="Photo URL" htmlFor="photoUrl">
            <input
              id="photoUrl"
              name="photoUrl"
              type="url"
              className="input"
              defaultValue={record?.photoUrl ?? ""}
            />
          </Field>
          <Field label="Short bio" htmlFor="bio">
            <textarea
              id="bio"
              name="bio"
              className="textarea"
              defaultValue={record?.bio ?? ""}
            />
          </Field>
          <Field
            label="Sort order"
            htmlFor="sortOrder"
            hint="Lower numbers appear first (e.g. 0 for the principal)."
          >
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min={0}
              className="input max-w-[120px]"
              defaultValue={record?.sortOrder ?? 0}
            />
          </Field>
          <SubmitButton>{record ? "Save changes" : "Add member"}</SubmitButton>
        </form>
      )}

      {staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Add your principal and teachers to build your directory."
        />
      ) : (
        <div className="space-y-2">
          {staff.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.photoUrl}
                    alt={m.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                    {m.name.slice(0, 1)}
                  </div>
                )}
                <div>
                  <p className="font-medium text-slate-900">{m.name}</p>
                  <p className="text-sm text-slate-500">
                    {m.title}
                    {m.department ? ` · ${m.department}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`?edit=${m.id}`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <DeleteButton action={deleteStaff} id={m.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
