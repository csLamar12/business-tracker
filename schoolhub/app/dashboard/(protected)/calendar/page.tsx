import Link from "next/link";
import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field, EmptyState } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatDateRange, toDateInputValue } from "@/lib/format";
import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_LABELS,
  type CalendarCategory,
} from "@/lib/constants";
import { saveCalendarEntry, deleteCalendarEntry } from "./actions";

export default async function ManageCalendar({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  const school = await requireActiveSchool();
  const editing = searchParams.edit;
  const record =
    editing && editing !== "new"
      ? await prisma.calendarEntry.findFirst({
          where: { id: editing, schoolId: school.id },
        })
      : null;

  const entries = await prisma.calendarEntry.findMany({
    where: { schoolId: school.id },
    orderBy: { startDate: "asc" },
  });

  return (
    <>
      <PageTitle
        title="Academic calendar"
        description="Term dates, examinations, holidays and key events."
        action={
          !editing ? (
            <Link href="?edit=new" className="btn btn-primary btn-sm">
              + New entry
            </Link>
          ) : (
            <Link href="/calendar" className="btn btn-outline btn-sm">
              Cancel
            </Link>
          )
        }
      />

      {editing && (
        <form action={saveCalendarEntry} className="card mb-8 space-y-4">
          <h2 className="font-semibold text-slate-900">
            {record ? "Edit calendar entry" : "New calendar entry"}
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
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start date" htmlFor="startDate" required>
              <input
                id="startDate"
                name="startDate"
                type="date"
                className="input"
                defaultValue={toDateInputValue(record?.startDate)}
                required
              />
            </Field>
            <Field label="End date (optional)" htmlFor="endDate">
              <input
                id="endDate"
                name="endDate"
                type="date"
                className="input"
                defaultValue={toDateInputValue(record?.endDate)}
              />
            </Field>
            <Field label="Category" htmlFor="category" required>
              <select
                id="category"
                name="category"
                className="select"
                defaultValue={(record?.category as CalendarCategory) ?? "TERM"}
              >
                {CALENDAR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CALENDAR_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
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
          <SubmitButton>{record ? "Save changes" : "Add entry"}</SubmitButton>
        </form>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title="No calendar entries"
          description="Build out your academic year with term dates, exams and holidays."
        />
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {formatDateRange(e.startDate, e.endDate)}
                </p>
                <p className="text-slate-700">
                  {e.title}{" "}
                  <span className="text-xs text-slate-400">
                    ·{" "}
                    {CALENDAR_CATEGORY_LABELS[
                      (e.category as CalendarCategory) in
                      CALENDAR_CATEGORY_LABELS
                        ? (e.category as CalendarCategory)
                        : "OTHER"
                    ]}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`?edit=${e.id}`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <DeleteButton action={deleteCalendarEntry} id={e.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
