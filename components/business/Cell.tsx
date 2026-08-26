"use client";

import { useState } from "react";

type CellType = "text" | "number" | "date" | "select";

/** Long text collapses to one line with a small rotating chevron pill that
 * expands it inline. Double-click the text to edit. */
function ExpandableText({ value, onEdit }: { value: string; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const long = value.length > 60 || value.includes("\n");
  if (!long) {
    return (
      <span className="block cursor-pointer truncate" title="Double-click to edit" onDoubleClick={onEdit}>
        {value}
      </span>
    );
  }
  return (
    <div className="flex items-start gap-1.5">
      <span
        className={`min-w-0 flex-1 cursor-pointer ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}
        title="Double-click to edit"
        onDoubleClick={onEdit}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Collapse" : "Expand"}
        title={open ? "Collapse" : "Show more"}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] transition-transform"
        style={{
          background: "var(--accent-soft)",
          color: "var(--accent)",
          transform: open ? "rotate(180deg)" : "none",
        }}
      >
        ▾
      </button>
    </div>
  );
}

export default function Cell({
  value,
  display,
  type = "text",
  options,
  expandable = false,
  onSave,
}: {
  value: string;
  /** Text to show when not editing (e.g. a 2dp amount); editing still uses `value`. */
  display?: string;
  type?: CellType;
  options?: string[];
  expandable?: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const shown = display ?? value;

  function commit() {
    setEditing(false);
    if (v !== value) onSave(v);
  }

  function startEdit() {
    setV(value);
    setEditing(true);
  }

  if (!editing) {
    if (expandable && value) {
      return <ExpandableText value={shown} onEdit={startEdit} />;
    }
    return (
      <span className="block cursor-pointer truncate" title="Double-click to edit" onDoubleClick={startEdit}>
        {shown || <span style={{ color: "var(--muted)" }}>—</span>}
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
