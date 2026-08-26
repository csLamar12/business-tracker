"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Remembered values to suggest from, best-first (e.g. most-used). */
  suggestions: string[];
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
}

/**
 * Inline "ghost text" autocomplete (Gmail Smart-Compose style). As you type,
 * the best remembered match shows as muted text after the caret.
 *
 * Completing the suggestion:
 *  - Desktop: Tab (or → / End). A second Tab — now that there's nothing left to
 *    complete — falls through to normal focus traversal to the next field.
 *  - Mobile: Space, since soft keyboards have no Tab key.
 *
 * Implementation: a muted ghost layer sits on top of a transparent-background
 * input. The ghost reserves the exact width of what you've typed (an invisible
 * copy of it) and then prints the remaining suffix, so it lines up with the
 * real text underneath. Horizontal scroll is mirrored so long values stay aligned.
 */
export default function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  onEnter,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [coarse, setCoarse] = useState(false); // touch / soft-keyboard device

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      setCoarse(window.matchMedia("(pointer: coarse)").matches);
    }
  }, []);

  // Best completion: the first remembered value that extends what's typed
  // (case-insensitive prefix, strictly longer). No text → no suggestion.
  const suggestion = useMemo(() => {
    if (!value) return "";
    const lower = value.toLowerCase();
    for (const s of suggestions) {
      if (s.length > value.length && s.toLowerCase().startsWith(lower)) return s;
    }
    return "";
  }, [value, suggestions]);

  const ghost = suggestion ? suggestion.slice(value.length) : "";

  // Keep the ghost's horizontal scroll in lockstep with the input's.
  function syncScroll() {
    if (ghostRef.current && inputRef.current) {
      ghostRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }
  useEffect(syncScroll, [value]);

  function accept() {
    if (!suggestion) return;
    onChange(suggestion);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.setSelectionRange(suggestion.length, suggestion.length);
        syncScroll();
      }
    });
  }

  function caretAtEnd() {
    const el = inputRef.current;
    return !!el && (el.selectionStart ?? 0) >= value.length && el.selectionStart === el.selectionEnd;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Complete the ghost. Tab on desktop; →/End anywhere the caret is at the end.
    // When there's no ghost we DON'T touch Tab, so it moves to the next field.
    if (ghost && e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      accept();
      return;
    }
    if (ghost && (e.key === "ArrowRight" || e.key === "End") && caretAtEnd()) {
      e.preventDefault();
      accept();
      return;
    }
    // Soft keyboards have no Tab, so Space completes there (only at the end,
    // and only on touch devices, so desktop spaces type normally).
    if (ghost && e.key === " " && coarse && caretAtEnd()) {
      e.preventDefault();
      accept();
      return;
    }
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Ghost layer — on top, transparent bg, non-interactive. */}
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
        ref={inputRef}
        type="text"
        className="input"
        style={{ background: "transparent", position: "relative" }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        autoComplete="off"
        spellCheck={false}
      />
      {/* Affordance hint while a completion is available. */}
      {ghost && (
        <span
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {coarse ? "space" : "tab"}
        </span>
      )}
    </div>
  );
}
