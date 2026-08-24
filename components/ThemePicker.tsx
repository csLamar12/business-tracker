"use client";

import { useEffect, useState } from "react";

const THEMES = [
  { id: "aegean", label: "Aegean" },
  { id: "amalfi", label: "Amalfi" },
  { id: "manhattan", label: "Manhattan" },
  { id: "midnight", label: "Midnight" },
];

export default function ThemePicker() {
  const [theme, setTheme] = useState("aegean");

  useEffect(() => {
    const saved = localStorage.getItem("bt-theme") || "aegean";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function choose(id: string) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    localStorage.setItem("bt-theme", id);
  }

  return (
    <div className="w-28">
      <select
        className="input py-1"
        value={theme}
        onChange={(e) => choose(e.target.value)}
        title="Theme"
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
