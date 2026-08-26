"use client";

// Renders free text with @-mentions of KNOWN names highlighted, so a reader can
// tell a mention from ordinary text. Mirrors lib/mentions matching: word-bounded
// (?<!\w)@Name(?!\w), longest name first so "@Anna Maria" wins over "@Anna", and
// no email false-positives.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function MentionText({
  text,
  names,
}: {
  text: string;
  names: string[];
}) {
  if (!text) return null;
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!sorted.length) return <>{text}</>;

  const re = new RegExp(`(?<!\\w)@(?:${sorted.map(escapeRegExp).join("|")})(?!\\w)`, "gi");
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <span key={key++} className="mention">
        {m[0]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
