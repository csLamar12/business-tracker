// Pure recurrence maths. No DB, no React — kept separate so the awkward cases
// (month-end clamping, leap days) can be reasoned about and tested directly.

export const PERIODS = ["hourly", "daily", "weekly", "monthly", "yearly"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/** Midnight UTC for a YYYY-MM-DD string. Dates are stored date-only, so all
 * stepping happens in UTC — using local time would drift an occurrence across a
 * day boundary depending on where the viewer is. */
export function parseDateUtc(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Advance `from` by `n` periods.
 *
 * Month and year steps clamp to the end of the target month, so a rule that
 * starts on the 31st lands on the 30th/28th where that month is shorter — and
 * critically, we step from the ORIGINAL anchor each time (see occurrencesFrom)
 * rather than from the clamped result, so Jan 31 → Feb 28 → Mar 31, not
 * Feb 28 → Mar 28.
 */
export function addPeriods(from: Date, period: Period, n: number): Date {
  const d = new Date(from.getTime());
  switch (period) {
    case "hourly":
      d.setUTCHours(d.getUTCHours() + n);
      return d;
    case "daily":
      d.setUTCDate(d.getUTCDate() + n);
      return d;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + n * 7);
      return d;
    case "monthly": {
      const anchorDay = d.getUTCDate();
      const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
      const dim = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
      target.setUTCDate(Math.min(anchorDay, dim));
      target.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), 0, 0);
      return target;
    }
    case "yearly": {
      const anchorDay = d.getUTCDate();
      const target = new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), 1));
      const dim = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
      target.setUTCDate(Math.min(anchorDay, dim)); // Feb 29 -> Feb 28 off-cycle
      target.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), 0, 0);
      return target;
    }
  }
}

/**
 * Occurrences of a rule that are due at or before `through`, plus the single
 * next one after it (the chosen "today + next upcoming" horizon).
 *
 * `cap` bounds the result so an hourly rule left running for months can't
 * materialise tens of thousands of rows in one request; the caller reports when
 * it bites rather than silently truncating.
 */
export function occurrencesFrom(
  start: Date,
  period: Period,
  interval: number,
  through: Date,
  cap = 500,
): { due: Date[]; next: Date | null; capped: boolean } {
  const step = Math.max(1, Math.floor(interval || 1));
  const due: Date[] = [];
  let i = 0;
  let cur = start;
  while (cur.getTime() <= through.getTime()) {
    due.push(cur);
    if (due.length >= cap) {
      // Report the next one relative to where we stopped, so a later pass picks
      // up exactly where this one left off.
      return { due, next: addPeriods(start, period, (i + 1) * step), capped: true };
    }
    i += 1;
    cur = addPeriods(start, period, i * step); // always from the anchor
  }
  return { due, next: cur, capped: false };
}
