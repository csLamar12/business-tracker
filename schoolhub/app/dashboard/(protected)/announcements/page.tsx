import Link from "next/link";
import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field, EmptyState } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatDate } from "@/lib/format";
import { saveAnnouncement, deleteAnnouncement } from "./actions";

export default async function ManageAnnouncements({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const school = await requireActiveSchool();
  const editing = searchParams.edit;
  const record =
    editing && editing !== "new"
      ? await prisma.announcement.findFirst({
          where: { id: editing, schoolId: school.id },
        })
      : null;

  const announcements = await prisma.announcement.findMany({
    where: { schoolId: school.id },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
  });

  return (
    <>
      <PageTitle
        title="Announcements"
        description="Post news and notices for your school community."
        action={
          !editing ? (
            <Link href="?edit=new" className="btn btn-primary btn-sm">
              + New announcement
            </Link>
          ) : (
            <Link href="/announcements" className="btn btn-outline btn-sm">
              Cancel
            </Link>
          )
        }
      />

      {editing && (
        <form action={saveAnnouncement} className="card mb-8 space-y-4">
          <h2 className="font-semibold text-slate-900">
            {record ? "Edit announcement" : "New announcement"}
          </h2>
          {record && <input type="hidden" name="id" value={record.id} />}
          <Field label="Title" htmlFor="title" required>
            <input
              id="title"
              name="title"
              className="input"
              defaultValue={record?.title ?? ""}
              required
            />
          </Field>
          <Field label="Body" htmlFor="body" required>
            <textarea
              id="body"
              name="body"
              className="textarea"
              defaultValue={record?.body ?? ""}
              required
            />
          </Field>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="pinned"
                defaultChecked={record?.pinned ?? false}
              />
              Pin to top
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="published"
                defaultChecked={record?.published ?? true}
              />
              Published
            </label>
          </div>
          <SubmitButton>{record ? "Save changes" : "Publish"}</SubmitButton>
        </form>
      )}

      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements yet"
          description="Create your first announcement to keep your community informed."
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  {a.pinned && (
                    <span className="badge bg-amber-100 text-amber-800">
                      Pinned
                    </span>
                  )}
                  {!a.published && (
                    <span className="badge bg-slate-100 text-slate-500">
                      Draft
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {formatDate(a.publishedAt)}
                  </span>
                </div>
                <p className="mt-1 font-medium text-slate-900">{a.title}</p>
                <p className="line-clamp-2 text-sm text-slate-500">{a.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`?edit=${a.id}`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <DeleteButton action={deleteAnnouncement} id={a.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
