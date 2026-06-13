import { requireActiveSchool } from "@/lib/context";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { toDateInputValue } from "@/lib/format";
import { saveAdmissions } from "./actions";

export default async function ManageAdmissions({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const school = await requireActiveSchool();
  const info = await prisma.admissionsInfo.findUnique({
    where: { schoolId: school.id },
  });

  return (
    <>
      <PageTitle
        title="Admissions"
        description="Keep your entry requirements, process and fees up to date."
      />

      {searchParams.saved === "1" && (
        <p className="mb-6 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Admissions information saved.
        </p>
      )}

      <form action={saveAdmissions} className="card space-y-5">
        <Field
          label="Introduction"
          htmlFor="introHtml"
          hint="A short welcome paragraph. Basic HTML is supported."
        >
          <textarea
            id="introHtml"
            name="introHtml"
            className="textarea"
            defaultValue={info?.introHtml ?? ""}
          />
        </Field>
        <Field label="Entry requirements" htmlFor="requirementsHtml">
          <textarea
            id="requirementsHtml"
            name="requirementsHtml"
            className="textarea"
            defaultValue={info?.requirementsHtml ?? ""}
          />
        </Field>
        <Field label="Application process" htmlFor="processHtml">
          <textarea
            id="processHtml"
            name="processHtml"
            className="textarea"
            defaultValue={info?.processHtml ?? ""}
          />
        </Field>
        <Field label="Fees" htmlFor="feesHtml">
          <textarea
            id="feesHtml"
            name="feesHtml"
            className="textarea"
            defaultValue={info?.feesHtml ?? ""}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Applications open" htmlFor="opensOn">
            <input
              id="opensOn"
              name="opensOn"
              type="date"
              className="input"
              defaultValue={toDateInputValue(info?.opensOn)}
            />
          </Field>
          <Field label="Applications close" htmlFor="closesOn">
            <input
              id="closesOn"
              name="closesOn"
              type="date"
              className="input"
              defaultValue={toDateInputValue(info?.closesOn)}
            />
          </Field>
          <Field label="Application link" htmlFor="applyUrl">
            <input
              id="applyUrl"
              name="applyUrl"
              type="url"
              className="input"
              placeholder="https://…"
              defaultValue={info?.applyUrl ?? ""}
            />
          </Field>
        </div>
        <SubmitButton>Save admissions info</SubmitButton>
      </form>
    </>
  );
}
