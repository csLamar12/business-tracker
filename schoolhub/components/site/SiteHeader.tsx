"use client";

import { useState } from "react";
import Link from "next/link";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/announcements", label: "Announcements" },
  { href: "/calendar", label: "Calendar" },
  { href: "/admissions", label: "Admissions" },
  { href: "/staff", label: "Staff" },
  { href: "/events", label: "Events" },
  { href: "/achievements", label: "Achievements" },
  { href: "/alumni", label: "Alumni" },
];

export function SiteHeader({
  schoolName,
  logoUrl,
}: {
  schoolName: string;
  logoUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-brand text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${schoolName} logo`}
              className="h-10 w-10 rounded-full bg-white object-contain p-0.5"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 font-bold">
              {schoolName.slice(0, 1)}
            </span>
          )}
          <span className="text-base font-bold leading-tight sm:text-lg">
            {schoolName}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-white/85 transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="rounded-md p-2 lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/10 bg-brand px-4 pb-4 lg:hidden">
          <div className="grid gap-1 pt-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
