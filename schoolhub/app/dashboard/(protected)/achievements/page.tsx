import Link from "next/link";
import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field, EmptyState } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatDate, toDateInputValue } from "@/lib/format";
import { saveAchievement, deleteAchievement } from "./actions";

export default async function ManageAchievements({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const school = await requireActiveSchool();
  const editing = searchParams.edit;
  const record =
    editing && editing !== "new"
      ? await prisma.achievement.findFirst({
          where: { id: editing, schoolId: school.id },
        })
      : null;

  const achievements = await prisma.achievement.findMany({
    where: { schoolId: school.id },
    orderBy: { achievedOn: "desc" },
  });

  return (
    <>
      <PageTitle
        title="Student achievements"
        description="Celebrate academic, sporting and artistic success."
        action={
          !editing ? (
            <Link href="?edit=new" className="btn btn-primary btn-sm">
              + New achievement
            </Link>
          ) : (
            <Link href="/achievements" className="btn btn-outline btn-sm">
              Cancel
            </Link>
          )
        }
      />

      {editing && (
        <form action={saveAchievement} className="card mb-8 space-y-4">
          <h2 className="font-semibold text-slate-900">
            {record ? "Edit achievement" : "New achievement"}
          </h2>
          {record && <input type="hidden" name="id" value={record.id} />}
          <Field label="Title" htmlFor="title" required>
            <input
              id="title"
              name="title"
              className="input"
              placeholder="e.g. 10 CSEC Grade Ones"
              defaultValue={record?.title ?? ""}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Student / group" htmlFor="studentName">
              <input
                id="studentName"
                name="studentName"
                className="input"
                defaultValue={record?.studentName ?? ""}
              />
            </Field>
            <Field label="Category" htmlFor="category">
              <input
                id="category"
                name="category"
                className="input"
                placeholder="Academics, Sports…"
                defaultValue={record?.category ?? ""}
              />
            </Field>
            <Field label="Date" htmlFor="achievedOn">
              <input
                id="achievedOn"
                name="achievedOn"
                type="date"
                className="input"
                defaultValue={toDateInputValue(record?.achievedOn)}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <textarea
              id="description"
              name="description"
              className="textarea"
              defaultValue={record?.description ?? ""}
            />
          </Field>
          <Field label="Image URL" htmlFor="imageUrl">
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              className="input"
              defaultValue={record?.imageUrl ?? ""}
            />
          </Field>
          <SubmitButton>{record ? "Save changes" : "Add achievement"}</SubmitButton>
        </form>
      )}

      {achievements.length === 0 ? (
        <EmptyState
          title="No achievements yet"
          description="Showcase your students' accomplishments here."
        />
      ) : (
        <div className="space-y-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-slate-900">{a.title}</p>
                <p className="text-sm text-slate-500">
                  {[a.studentName, a.category].filter(Boolean).join(" · ")}
                  {a.achievedOn ? ` · ${formatDate(a.achievedOn)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`?edit=${a.id}`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <DeleteButton action={deleteAchievement} id={a.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
