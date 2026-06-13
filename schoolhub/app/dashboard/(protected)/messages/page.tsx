import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageTitle } from "@/components/dashboard/PageTitle";
import { EmptyState } from "@/components/ui/Field";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatDateTime } from "@/lib/format";
import { PLAN_INFO } from "@/lib/constants";
import { toggleHandled, deleteMessage } from "./actions";

export default async function MessagesPage() {
  const session = await getSession();
  if (session?.role !== "SUPERADMIN") redirect("/");

  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageTitle
        title="Enquiries"
        description="Leads from the SchoolHub Jamaica contact form."
      />

      {messages.length === 0 ? (
        <EmptyState
          title="No enquiries yet"
          description="Messages from the marketing site's contact form land here."
        />
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border bg-white p-4 ${
                m.handled ? "border-slate-200 opacity-70" : "border-brand/30"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    {m.name}
                    {m.schoolName ? (
                      <span className="text-slate-500"> · {m.schoolName}</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-500">
                    <a href={`mailto:${m.email}`} className="hover:underline">
                      {m.email}
                    </a>
                    {m.phone ? ` · ${m.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.plan && (
                    <span className="badge bg-brand/10 text-brand">
                      {PLAN_INFO[m.plan as "STANDARD" | "PREMIUM"]?.name ??
                        m.plan}
                    </span>
                  )}
                  {m.handled && (
                    <span className="badge bg-green-100 text-green-700">
                      Handled
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                {m.message}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {formatDateTime(m.createdAt)}
                </span>
                <div className="flex gap-2">
                  <form action={toggleHandled}>
                    <input type="hidden" name="id" value={m.id} />
                    <input
                      type="hidden"
                      name="handled"
                      value={String(m.handled)}
                    />
                    <button className="btn btn-outline btn-sm">
                      {m.handled ? "Mark unhandled" : "Mark handled"}
                    </button>
                  </form>
                  <DeleteButton
                    action={deleteMessage}
                    id={m.id}
                    confirmText="Delete this enquiry?"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
