import { requireSession } from "@/lib/auth";
import { requireActiveSchool } from "@/lib/context";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { logout, switchSchool } from "../actions";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const school = await requireActiveSchool();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        schoolName={school.name}
        subdomain={school.subdomain}
        customDomain={school.customDomain}
        plan={school.plan}
        isSuperadmin={session.role === "SUPERADMIN"}
        logoutAction={logout}
        switchSchoolAction={switchSchool}
      />
      <div className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
