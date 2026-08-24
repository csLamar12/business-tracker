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
