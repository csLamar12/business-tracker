"use client";

import { useState } from "react";

type CellType = "text" | "number" | "date" | "select";

export default function Cell({
  value,
  type = "text",
  options,
  onSave,
}: {
  value: string;
  type?: CellType;
  options?: string[];
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);

  function commit() {
    setEditing(false);
    if (v !== value) onSave(v);
  }

  if (!editing) {
    return (
      <span
        className="block cursor-pointer truncate"
        title="Double-click to edit"
        onDoubleClick={() => {
          setV(value);
          setEditing(true);
        }}
      >
        {value || <span style={{ color: "var(--muted)" }}>—</span>}
      </span>
    );
  }

  if (type === "select") {
    return (
      <select
        className="input py-1"
        autoFocus
        value={v}
        onChange={(e) => {
          const nv = e.target.value;
          setV(nv);
          setEditing(false);
          if (nv !== value) onSave(nv);
        }}
        onBlur={() => setEditing(false)}
      >
        {options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="input py-1"
      autoFocus
      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
