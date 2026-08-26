"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  names: string[];
  /** Remembered whole-field values to offer as inline ghost completions
   *  (single-line only; ignored while the @-mention menu is open). */
  suggestions?: string[];
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
}

export default function MentionInput({
  value,
  onChange,
  names,
  suggestions,
  multiline,
  placeholder,
  className,
  onEnter,
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [at, setAt] = useState(-1);
  const [coarse, setCoarse] = useState(false); // touch / soft-keyboard device

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      setCoarse(window.matchMedia("(pointer: coarse)").matches);
    }
  }, []);

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

  // ── inline ghost completion (single-line, only when the @-menu is closed) ──
  const canGhost = !multiline && !open && !!value && !!suggestions?.length;
  let suggestion = "";
  if (canGhost) {
    const lower = value.toLowerCase();
    for (const s of suggestions!) {
      if (s.length > value.length && s.toLowerCase().startsWith(lower)) {
        suggestion = s;
        break;
      }
    }
  }
  const ghost = suggestion ? suggestion.slice(value.length) : "";

  function syncScroll() {
    if (ghostRef.current && ref.current) {
      ghostRef.current.scrollLeft = ref.current.scrollLeft;
    }
  }
  useEffect(syncScroll, [value]);

  function caretAtEnd() {
    const el = ref.current;
    return (
      !!el &&
      (el.selectionStart ?? 0) >= value.length &&
      el.selectionStart === el.selectionEnd
    );
  }

  function acceptGhost() {
    if (!suggestion) return;
    onChange(suggestion);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.setSelectionRange(suggestion.length, suggestion.length);
        syncScroll();
      }
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
    // Complete the ghost: Tab (desktop), Space (touch, no Tab key), or →/End.
    // With no ghost, Tab falls through to normal focus traversal.
    if (ghost && e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      acceptGhost();
      return;
    }
    if (ghost && (e.key === "ArrowRight" || e.key === "End") && caretAtEnd()) {
      e.preventDefault();
      acceptGhost();
      return;
    }
    if (ghost && e.key === " " && coarse && caretAtEnd()) {
      e.preventDefault();
      acceptGhost();
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
    onScroll: syncScroll,
    onBlur: () => setTimeout(() => setOpen(false), 150),
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea {...common} rows={6} />
      ) : (
        <>
          {/* Ghost layer — sits over the (transparent) input; the card behind
              provides the field background. */}
          <div
            ref={ghostRef}
            aria-hidden="true"
            className="input pointer-events-none absolute inset-0 overflow-hidden"
            style={{
              whiteSpace: "pre",
              background: "transparent",
              borderColor: "transparent",
              color: "var(--muted)",
            }}
          >
            <span style={{ visibility: "hidden" }}>{value}</span>
            {ghost}
          </div>
          <input
            {...common}
            type="text"
            style={{ background: "transparent", position: "relative" }}
            autoComplete="off"
          />
          {ghost && (
            <span
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {coarse ? "space" : "tab"}
            </span>
          )}
        </>
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
