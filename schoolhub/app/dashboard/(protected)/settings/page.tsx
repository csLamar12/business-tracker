import { requireActiveSchool } from "@/lib/context";
import { getSession } from "@/lib/auth";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ROOT_DOMAIN } from "@/lib/utils";
import { PLAN_INFO, PLANS } from "@/lib/constants";
import { saveProfile, saveDomain } from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const school = await requireActiveSchool();
  const session = await getSession();
  const isSuperadmin = session?.role === "SUPERADMIN";

  return (
    <>
      <PageTitle
        title="Settings"
        description="Your school's identity, branding and web address."
      />

      {searchParams.saved === "1" && (
        <p className="mb-6 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Settings saved.
        </p>
      )}
      {searchParams.error && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      {/* Profile / branding */}
      <form action={saveProfile} className="card space-y-5">
        <h2 className="font-semibold text-slate-900">School profile</h2>
        <Field label="School name" htmlFor="name" required>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={school.name}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tagline" htmlFor="tagline">
            <input
              id="tagline"
              name="tagline"
              className="input"
              placeholder="Educating leaders since 1925"
              defaultValue={school.tagline ?? ""}
            />
          </Field>
          <Field label="Motto" htmlFor="motto">
            <input
              id="motto"
              name="motto"
              className="input"
              defaultValue={school.motto ?? ""}
            />
          </Field>
        </div>
        <Field
          label="About"
          htmlFor="aboutHtml"
          hint="Shown on your home page. Basic HTML is supported."
        >
          <textarea
            id="aboutHtml"
            name="aboutHtml"
            className="textarea"
            defaultValue={school.aboutHtml ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logo URL" htmlFor="logoUrl">
            <input
              id="logoUrl"
              name="logoUrl"
              type="url"
              className="input"
              defaultValue={school.logoUrl ?? ""}
            />
          </Field>
          <Field label="Hero image URL" htmlFor="heroImageUrl">
            <input
              id="heroImageUrl"
              name="heroImageUrl"
              type="url"
              className="input"
              defaultValue={school.heroImageUrl ?? ""}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary colour" htmlFor="primaryColor">
            <input
              id="primaryColor"
              name="primaryColor"
              type="color"
              className="h-10 w-full rounded-lg border border-slate-300"
              defaultValue={school.primaryColor}
            />
          </Field>
          <Field label="Accent colour" htmlFor="secondaryColor">
            <input
              id="secondaryColor"
              name="secondaryColor"
              type="color"
              className="h-10 w-full rounded-lg border border-slate-300"
              defaultValue={school.secondaryColor}
            />
          </Field>
        </div>

        <hr className="border-slate-100" />
        <h3 className="text-sm font-semibold text-slate-700">
          Contact & leadership
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Principal" htmlFor="principalName">
            <input
              id="principalName"
              name="principalName"
              className="input"
              defaultValue={school.principalName ?? ""}
            />
          </Field>
          <Field label="Founded (year)" htmlFor="foundedYear">
            <input
              id="foundedYear"
              name="foundedYear"
              className="input"
              placeholder="1925"
              defaultValue={school.foundedYear ?? ""}
            />
          </Field>
          <Field label="Address" htmlFor="addressLine">
            <input
              id="addressLine"
              name="addressLine"
              className="input"
              defaultValue={school.addressLine ?? ""}
            />
          </Field>
          <Field label="Parish" htmlFor="parish">
            <input
              id="parish"
              name="parish"
              className="input"
              defaultValue={school.parish ?? ""}
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <input
              id="phone"
              name="phone"
              className="input"
              defaultValue={school.phone ?? ""}
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              defaultValue={school.email ?? ""}
            />
          </Field>
        </div>

        <hr className="border-slate-100" />
        <h3 className="text-sm font-semibold text-slate-700">Social media</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facebook URL" htmlFor="facebookUrl">
            <input
              id="facebookUrl"
              name="facebookUrl"
              type="url"
              className="input"
              defaultValue={school.facebookUrl ?? ""}
            />
          </Field>
          <Field label="Instagram URL" htmlFor="instagramUrl">
            <input
              id="instagramUrl"
              name="instagramUrl"
              type="url"
              className="input"
              defaultValue={school.instagramUrl ?? ""}
            />
          </Field>
          <Field label="Twitter / X URL" htmlFor="twitterUrl">
            <input
              id="twitterUrl"
              name="twitterUrl"
              type="url"
              className="input"
              defaultValue={school.twitterUrl ?? ""}
            />
          </Field>
          <Field label="YouTube URL" htmlFor="youtubeUrl">
            <input
              id="youtubeUrl"
              name="youtubeUrl"
              type="url"
              className="input"
              defaultValue={school.youtubeUrl ?? ""}
            />
          </Field>
        </div>

        <SubmitButton>Save profile</SubmitButton>
      </form>

      {/* Domain & plan */}
      <div className="mt-8 card space-y-5">
        <div>
          <h2 className="font-semibold text-slate-900">Web address & plan</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isSuperadmin
              ? "Manage this school's subdomain, plan and custom domain."
              : "Contact SchoolHub Jamaica to change your plan or connect a custom domain."}
          </p>
        </div>

        {isSuperadmin ? (
          <form action={saveDomain} className="space-y-5">
            <Field
              label="Subdomain"
              htmlFor="subdomain"
              hint={`Your site will live at <subdomain>.${ROOT_DOMAIN}`}
              required
            >
              <div className="flex items-center">
                <input
                  id="subdomain"
                  name="subdomain"
                  className="input rounded-r-none"
                  defaultValue={school.subdomain}
                  required
                />
                <span className="inline-flex h-[42px] items-center rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
                  .{ROOT_DOMAIN}
                </span>
              </div>
            </Field>

            <Field label="Plan" htmlFor="plan" required>
              <select
                id="plan"
                name="plan"
                className="select"
                defaultValue={school.plan}
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_INFO[p].name}
                    {PLAN_INFO[p].customDomain ? " (custom domain)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Custom domain"
              htmlFor="customDomain"
              hint="Premium plan only. e.g. www.yourschool.edu.jm — point a CNAME at the platform (see deploy docs)."
            >
              <input
                id="customDomain"
                name="customDomain"
                className="input"
                placeholder="www.yourschool.edu.jm"
                defaultValue={school.customDomain ?? ""}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="published"
                defaultChecked={school.published}
              />
              Published (visible to the public)
            </label>

            <SubmitButton>Save web address</SubmitButton>
          </form>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium text-slate-900">
                {PLAN_INFO[school.plan as "STANDARD" | "PREMIUM"]?.name ??
                  school.plan}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Address</dt>
              <dd className="font-medium text-slate-900">
                {school.plan === "PREMIUM" && school.customDomain
                  ? school.customDomain
                  : `${school.subdomain}.${ROOT_DOMAIN}`}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium text-slate-900">
                {school.published ? "Published" : "Unpublished"}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </>
  );
}
