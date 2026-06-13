"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: "🏠" },
  { href: "/announcements", label: "Announcements", icon: "📣" },
  { href: "/events", label: "Events", icon: "🎉" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/staff", label: "Staff", icon: "👩🏽‍🏫" },
  { href: "/achievements", label: "Achievements", icon: "🏆" },
  { href: "/alumni", label: "Alumni", icon: "🤝" },
  { href: "/admissions", label: "Admissions", icon: "🎓" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const SUPERADMIN_NAV = [
  { href: "/schools", label: "All schools", icon: "🏫" },
  { href: "/messages", label: "Enquiries", icon: "📨" },
];

export function Sidebar({
  schoolName,
  subdomain,
  customDomain,
  plan,
  isSuperadmin,
  logoutAction,
  switchSchoolAction,
}: {
  schoolName: string;
  subdomain: string;
  customDomain: string | null;
  plan: string;
  isSuperadmin: boolean;
  logoutAction: () => void | Promise<void>;
  switchSchoolAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [siteUrl, setSiteUrl] = useState("#");

  useEffect(() => {
    const { protocol, hostname, port } = window.location;
    if (plan === "PREMIUM" && customDomain && hostname !== "localhost") {
      setSiteUrl(`https://${customDomain}`);
      return;
    }
    const base =
      hostname === "localhost" ? hostname : hostname.replace(/^app\./, "");
    const portPart = port ? `:${port}` : "";
    setSiteUrl(`${protocol}//${subdomain}.${base}${portPart}`);
  }, [plan, customDomain, subdomain]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Managing
        </p>
        <p className="mt-1 truncate font-bold text-slate-900">{schoolName}</p>
        <span className="badge mt-1 bg-brand/10 text-brand">{plan}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              isActive(item.href)
                ? "bg-brand text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {isSuperadmin && (
          <>
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Platform
            </p>
            {SUPERADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive(item.href)
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-3">
        <a
          href={siteUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline btn-sm w-full"
        >
          View live site ↗
        </a>
        {isSuperadmin && (
          <form action={switchSchoolAction}>
            <button className="btn btn-outline btn-sm w-full">
              Switch school
            </button>
          </form>
        )}
        <form action={logoutAction}>
          <button className="btn btn-outline btn-sm w-full">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
