import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // A plain string (not a template) on purpose: a root-level template would
  // leak the "· SchoolHub Jamaica" suffix into every tenant school's <title>.
  // The marketing layout owns that template; school sites define their own
  // (see app/s/[domain]/layout.tsx).
  title: "SchoolHub Jamaica",
  description:
    "SchoolHub Jamaica helps Jamaican high schools establish and manage a professional online presence — announcements, calendars, admissions, staff, events, achievements and alumni tools.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
