"use client";

import { useEffect, useState } from "react";

const THEMES = [
  { id: "aegean", label: "Aegean" },
  { id: "amalfi", label: "Amalfi" },
  { id: "manhattan", label: "Manhattan" },
  { id: "midnight", label: "Midnight" },
];

export default function ThemePicker() {
  // `theme` is the single source of truth. A sync effect keeps the <html>
  // data-theme + localStorage in lockstep with it, so the select value can
  // never drift out of sync with what's on screen (which would make it look
  // "stuck").
  const [theme, setTheme] = useState("aegean");

  // Adopt whatever the pre-hydration script / localStorage already applied.
  useEffect(() => {
    const current =
      document.documentElement.dataset.theme ||
      localStorage.getItem("bt-theme") ||
      "aegean";
    setTheme(current);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("bt-theme", theme);
    } catch {}
  }, [theme]);

  return (
    <div className="w-24 sm:w-28">
      <select
        className="input py-1"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        aria-label="Theme"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
