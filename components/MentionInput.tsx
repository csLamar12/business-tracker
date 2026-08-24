"use client";

import { useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  names: string[];
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
}

export default function MentionInput({
  value,
  onChange,
  names,
  multiline,
  placeholder,
  className,
  onEnter,
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [at, setAt] = useState(-1);

  function refresh(v: string, caret: number) {
    const before = v.slice(0, caret);
    const idx = before.lastIndexOf("@");
    if (idx < 0 || (idx > 0 && /\w/.test(before[idx - 1]))) {
      setOpen(false);
      return;
    }
    const token = before.slice(idx + 1);
    if (token.includes("\n")) {
      setOpen(false);
      return;
    }
    const m = names
      .filter((n) => n.toLowerCase().startsWith(token.toLowerCase()))
      .slice(0, 6);
    if (!m.length) {
      setOpen(false);
      return;
    }
    setMatches(m);
    setActive(0);
    setAt(idx);
    setOpen(true);
  }

  function pick(name: string) {
    const el = ref.current;
    if (!el || at < 0) return;
    const caret = el.selectionStart ?? value.length;
    const next = value.slice(0, at) + `@${name} ` + value.slice(caret);
    onChange(next);
    setOpen(false);
    // restore focus + caret after the inserted mention
    requestAnimationFrame(() => {
      el.focus();
      const pos = at + name.length + 2;
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, matches.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active]);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
      return;
    }
    if (e.key === "Enter" && !multiline && onEnter) {
      e.preventDefault();
      onEnter();
    }
  }

  const common = {
    ref: ref as never,
    value,
    placeholder,
    className: `input ${className ?? ""}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      refresh(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    onKeyDown,
    onBlur: () => setTimeout(() => setOpen(false), 150),
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea {...common} rows={6} />
      ) : (
        <input {...common} type="text" />
      )}
      {open && (
        <ul
          className="absolute z-30 mt-1 w-56 overflow-hidden rounded-md shadow-xl"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {matches.map((m, i) => (
            <li
              key={m}
              className="cursor-pointer px-3 py-1.5 text-sm"
              style={{ background: i === active ? "var(--accent)" : "transparent" }}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
            >
              @{m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
