/**
 * Date and time display. Pure functions with an explicit time zone, so the
 * server (which runs in UTC) and the browser always produce the same text.
 *
 * Three kinds of date, kept apart on purpose:
 *   1. Event timestamps (imported at, logged at, status changed at): stored in UTC,
 *      shown in the viewer's time zone.
 *   2. Partial original dates on reasoning entries ("2025", "2025-09", "2025-09-14"):
 *      calendar values, shown exactly as written, never converted.
 *   3. Original item dates from an import file: stored as noon UTC on that day, so
 *      they are shown as that calendar day, never shifted by the viewer's zone.
 */

export type TimeCtx = {
  /** IANA zone, e.g. "America/Los_Angeles". */
  tz: string;
  /** False when the browser's zone isn't known yet; times are then shown in UTC and labelled so. */
  known: boolean;
};

export const TZ_COOKIE = "spark_tz";
export const FALLBACK: TimeCtx = { tz: "UTC", known: false };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A cookie value (or anything else) → a safe time context. */
export function timeCtxFrom(value: unknown): TimeCtx {
  return isValidTimeZone(value) ? { tz: value, known: true } : FALLBACK;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

const partsCache = new Map<string, Intl.DateTimeFormat>();

/** Calendar parts of an instant in a zone, read with formatToParts so output never depends on locale quirks. */
function partsIn(date: Date, tz: string): Parts {
  let fmt = partsCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    partsCache.set(tz, fmt);
  }
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

function toDate(iso: string | Date): Date | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clock(p: Parts): string {
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, "0")} ${p.hour < 12 ? "AM" : "PM"}`;
}

/** "Oct 28, 2026, 1:11 PM" in the viewer's zone (", 8:11 PM UTC" when the zone isn't known). */
export function formatDateTime(iso: string | Date, ctx: TimeCtx): string {
  const d = toDate(iso);
  if (!d) return "";
  const p = partsIn(d, ctx.tz);
  return `${MONTHS[p.month - 1]} ${p.day}, ${p.year}, ${clock(p)}${ctx.known ? "" : " UTC"}`;
}

/** "Oct 28, 2026" — the calendar day the event happened on, in the viewer's zone. */
export function formatDate(iso: string | Date, ctx: TimeCtx): string {
  const d = toDate(iso);
  if (!d) return "";
  const p = partsIn(d, ctx.tz);
  return `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`;
}

/** "Oct 28" this year, "Oct 28, 2025" otherwise (years compared in the viewer's zone). */
export function formatShortDate(iso: string | Date, ctx: TimeCtx, now: Date = new Date()): string {
  const d = toDate(iso);
  if (!d) return "";
  const p = partsIn(d, ctx.tz);
  const sameYear = partsIn(now, ctx.tz).year === p.year;
  return sameYear ? `${MONTHS[p.month - 1]} ${p.day}` : `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`;
}

/** A partial original date exactly as precise as written: "2025", "Sep 2025", "Sep 14, 2025". No zone math. */
export function formatPartialDate(value: string | null | undefined): string {
  if (!value) return "Date unknown";
  const m = value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) return value;
  const [, y, mo, d] = m;
  if (!mo) return y!;
  const name = MONTHS[Number(mo) - 1] ?? mo;
  return d ? `${name} ${Number(d)}, ${y}` : `${name} ${y}`;
}

/**
 * Original item dates from an import file are stored at exactly noon UTC (see
 * the importer). They represent a calendar day, not an instant.
 */
export function isCalendarDayStamp(iso: string): boolean {
  const d = toDate(iso);
  if (!d || d.getUTCHours() !== 12 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0) return false;
  // Real event times carry fractional seconds (Postgres keeps microseconds); a calendar day has none.
  const frac = iso.match(/:\d{2}\.(\d+)/);
  return !frac || !/[1-9]/.test(frac[1]!);
}

/** That calendar day, read in UTC so no zone can move it: "Mar 1, 2025". */
export function formatCalendarDay(iso: string): string {
  const d = toDate(iso);
  if (!d) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
