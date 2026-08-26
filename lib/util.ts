// Small pure helpers shared across server + client.

const PALETTE = [
  "#1f6aa5", "#2e7d32", "#a52a2a", "#7b1fa2",
  "#ef6c00", "#00838f", "#5d4037", "#c62828",
];

/** Stable identity color for a name (port of profile.color_for, different hash). */
export function colorFor(name: string): string {
  if (!name) return "#555555";
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

/** Presence window: online if seen within `windowSeconds` (port of db.is_online). */
export function isOnline(
  lastSeenIso: string | null | undefined,
  windowSeconds = 45,
): boolean {
  if (!lastSeenIso) return false;
  const t = Date.parse(lastSeenIso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= windowSeconds * 1000;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Compact local "when it was added" stamp, e.g. "24 Aug, 2:15 PM". */
export function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true, // explicit AM/PM so a tiny "6:15" is never ambiguous
  });
}

/** Full timestamp for hover/title, e.g. "Mon, 24 Aug 2026, 2:15:03 PM". */
export function fmtStampFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
