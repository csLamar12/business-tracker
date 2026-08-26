"use client";

import { useState } from "react";
import MentionText from "../MentionText";

type CellType = "text" | "number" | "date" | "select";

/** Render text, highlighting @-mentions when a name list is supplied. */
function Body({ text, mentionNames }: { text: string; mentionNames?: string[] }) {
  return mentionNames ? <MentionText text={text} names={mentionNames} /> : <>{text}</>;
}

/** Long text collapses to one line with a small rotating chevron pill that
 * expands it inline. Double-click the text to edit. */
function ExpandableText({
  value,
  mentionNames,
  onEdit,
}: {
  value: string;
  mentionNames?: string[];
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const long = value.length > 60 || value.includes("\n");
  if (!long) {
    return (
      <span className="block cursor-pointer truncate" title="Double-click to edit" onDoubleClick={onEdit}>
        <Body text={value} mentionNames={mentionNames} />
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
        <Body text={value} mentionNames={mentionNames} />
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
  mentionNames,
  onSave,
}: {
  value: string;
  /** Text to show when not editing (e.g. a 2dp amount); editing still uses `value`. */
  display?: string;
  type?: CellType;
  options?: string[];
  expandable?: boolean;
  /** When set, @-mentions of these names are highlighted in the shown text. */
  mentionNames?: string[];
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
      return <ExpandableText value={shown} mentionNames={mentionNames} onEdit={startEdit} />;
    }
    return (
      <span className="block cursor-pointer truncate" title="Double-click to edit" onDoubleClick={startEdit}>
        {shown ? <Body text={shown} mentionNames={mentionNames} /> : <span style={{ color: "var(--muted)" }}>—</span>}
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
