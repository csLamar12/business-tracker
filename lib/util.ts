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

/** Relative "when it was added", e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
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
