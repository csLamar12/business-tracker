"use client";

import { useEffect, useState } from "react";

// Preserves the original anchorpointja.com download page for the AnchorPoint
// Business Tracker desktop app, so that functionality is not lost while
// anchorpointja.com temporarily hosts SchoolHub Jamaica during development.
const REPO = "csLamar12/business-tracker";
const MAC_URL = `https://github.com/${REPO}/releases/latest/download/BusinessTracker-mac.zip`;
const WIN_URL = `https://github.com/${REPO}/releases/latest/download/BusinessTracker-windows.zip`;

export default function DownloadPage() {
  const [primary, setPrimary] = useState({
    href: MAC_URL,
    label: "Download for macOS",
  });
  const [other, setOther] = useState({
    href: WIN_URL,
    label: "Download for Windows",
  });

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) {
      setPrimary({ href: WIN_URL, label: "Download for Windows" });
      setOther({ href: MAC_URL, label: "Download for macOS instead" });
    } else if (ua.includes("mac")) {
      setPrimary({ href: MAC_URL, label: "Download for macOS" });
      setOther({ href: WIN_URL, label: "Download for Windows instead" });
    }
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        AnchorPoint Business Tracker
      </h1>
      <p className="mt-2 text-slate-500">
        Track businesses, subsidiaries, income &amp; expenses.
      </p>
      <a href={primary.href} className="btn btn-primary mt-8">
        {primary.label}
      </a>
      <a href={other.href} className="mt-4 text-sm text-slate-500 hover:text-slate-700">
        {other.label}
      </a>
      <p className="mt-10 text-xs text-slate-400">
        Always installs the latest release.{" "}
        <a
          href={`https://github.com/${REPO}/releases`}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          All releases
        </a>
      </p>
    </div>
  );
}
