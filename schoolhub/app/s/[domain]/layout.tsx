import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSchoolByDomainParam } from "@/lib/tenant";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const school = await getSchoolByDomainParam(domain);
  if (!school) return { title: "School not found" };
  return {
    title: {
      default: school.name,
      template: `%s · ${school.name}`,
    },
    description:
      school.tagline ?? `The official website of ${school.name}.`,
  };
}

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const school = await getSchoolByDomainParam(domain);
  if (!school) notFound();

  return (
    <div
      className="flex min-h-screen flex-col bg-white"
      style={
        {
          "--brand-primary": school.primaryColor,
          "--brand-secondary": school.secondaryColor,
        } as React.CSSProperties
      }
    >
      <SiteHeader schoolName={school.name} logoUrl={school.logoUrl} />
      <main className="flex-1">{children}</main>
      <SiteFooter school={school} />
    </div>
  );
}
