import Link from "next/link";
import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field, EmptyState } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatDateTime, toDateTimeInputValue } from "@/lib/format";
import { saveEvent, deleteEvent } from "./actions";

export default async function ManageEvents({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  const school = await requireActiveSchool();
  const editing = searchParams.edit;
  const record =
    editing && editing !== "new"
      ? await prisma.event.findFirst({
          where: { id: editing, schoolId: school.id },
        })
      : null;

  const events = await prisma.event.findMany({
    where: { schoolId: school.id },
    orderBy: { startsAt: "desc" },
  });

  return (
    <>
      <PageTitle
        title="Events"
        description="Open days, graduations, fundraisers, sports fixtures and more."
        action={
          !editing ? (
            <Link href="?edit=new" className="btn btn-primary btn-sm">
              + New event
            </Link>
          ) : (
            <Link href="/events" className="btn btn-outline btn-sm">
              Cancel
            </Link>
          )
        }
      />

      {editing && (
        <form action={saveEvent} className="card mb-8 space-y-4">
          <h2 className="font-semibold text-slate-900">
            {record ? "Edit event" : "New event"}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="startsAt" required>
              <input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                className="input"
                defaultValue={toDateTimeInputValue(record?.startsAt)}
                required
              />
            </Field>
            <Field label="Ends (optional)" htmlFor="endsAt">
              <input
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                className="input"
                defaultValue={toDateTimeInputValue(record?.endsAt)}
              />
            </Field>
          </div>
          <Field label="Location" htmlFor="location">
            <input
              id="location"
              name="location"
              className="input"
              defaultValue={record?.location ?? ""}
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <textarea
              id="description"
              name="description"
              className="textarea"
              defaultValue={record?.description ?? ""}
            />
          </Field>
          <Field
            label="Image URL"
            htmlFor="imageUrl"
            hint="Optional. Paste a link to a banner image for this event."
          >
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              className="input"
              defaultValue={record?.imageUrl ?? ""}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="published"
              defaultChecked={record?.published ?? true}
            />
            Published
          </label>
          <SubmitButton>{record ? "Save changes" : "Create event"}</SubmitButton>
        </form>
      )}

      {events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Add your first event to promote it on your school site."
        />
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="text-xs font-semibold uppercase text-brand">
                  {formatDateTime(e.startsAt)}
                </p>
                <p className="font-medium text-slate-900">{e.title}</p>
                {e.location && (
                  <p className="text-sm text-slate-500">📍 {e.location}</p>
                )}
                {!e.published && (
                  <span className="badge mt-1 bg-slate-100 text-slate-500">
                    Draft
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`?edit=${e.id}`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <DeleteButton action={deleteEvent} id={e.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
