// Pure @-mention matcher — faithful port of db.parse_mentions.
//
// Matches longest names first and MASKS each matched span so a shorter name
// can't also match inside it (so "@Anna Maria" doesn't also match "Anna").
// A leading (?<!\w) keeps emails (notify@Lamar.com) from matching, and a
// trailing (?!\w) keeps "@Ann" from matching name "Anna".

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseMentions(text: string, names: string[]): Set<string> {
  const found = new Set<string>();
  if (!text) return found;
  let work = text;
  const sorted = names.filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const re = new RegExp(`(?<!\\w)@${escapeRegExp(name)}(?!\\w)`, "gi");
    let matched = false;
    let out = "";
    let last = 0;
    for (const m of work.matchAll(re)) {
      matched = true;
      const start = m.index;
      const end = start + m[0].length;
      out += work.slice(last, start) + " ".repeat(end - start);
      last = end;
    }
    if (matched) {
      found.add(name);
      out += work.slice(last);
      work = out;
    }
  }
  return found;
}
