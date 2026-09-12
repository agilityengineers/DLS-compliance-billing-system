// lib/time/agency.ts — the ONE place that converts between agency-local
// wall-clock time and UTC instants.
//
// Every timestamptz column (visits, EVV logs, medication schedules …) holds a
// UTC instant; every "date" the agency reasons about (the visit day, the
// Sun–Sat authorization week, the Mon–Sun payroll week, "today") is an
// agency-local date. Slicing an ISO string (`.slice(0, 10)`) mixes the two:
// it yields the UTC date, which is tomorrow for every evening visit in
// Colorado. Use these helpers instead.
//
// Pure Intl — no dependency, works in Node 20+ (full ICU) and browsers.
// Safe to import from client components (no `server-only`).

export const DEFAULT_AGENCY_TZ = "America/Denver";

// Declared rather than imported from @types/node: this package is imported by
// browser code, where `process` simply does not exist. Reading it unguarded
// throws a ReferenceError in any bundle that has not been told to shim it.
declare const process: { env?: Record<string, string | undefined> } | undefined;

/** Agency time zone. Overridable per deployment; the DB copy lives in app_settings.agency_timezone. */
export const AGENCY_TZ: string =
  (typeof process !== "undefined" ? process?.env?.NEXT_PUBLIC_AGENCY_TIMEZONE : undefined) ||
  DEFAULT_AGENCY_TZ;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short"
    });
    fmtCache.set(tz, f);
  }
  return f;
}

interface WallClock { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock fields of a UTC instant in `tz`. */
function wallClock(utcMs: number, tz: string): WallClock {
  const p: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second),
    weekday: WEEKDAY[p.weekday] ?? 0
  };
}

/** Milliseconds between `tz` wall-clock time and UTC at the given instant (positive east of UTC). */
function tzOffsetMs(utcMs: number, tz: string): number {
  const w = wallClock(utcMs, tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(utcMs / 1000) * 1000;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Agency-local date + "HH:MM" (or "HH:MM:SS") → UTC ISO instant.
 * Nonexistent wall-clock times (spring-forward gap) resolve forward to the
 * next valid instant; ambiguous times (fall-back overlap) resolve to the
 * FIRST occurrence (daylight time), matching Postgres' `AT TIME ZONE`.
 */
export function agencyToUtcIso(dateIso: string, hhmm: string, tz: string = AGENCY_TZ): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm, ss = 0] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
  // First guess using the offset in force at the wall-clock instant read as UTC,
  // then re-evaluate at the guessed instant so DST transitions settle.
  let utc = wall - tzOffsetMs(wall, tz);
  const offsetAtGuess = tzOffsetMs(utc, tz);
  const candidate = wall - offsetAtGuess;
  if (candidate !== utc) {
    // Around a transition the two offsets differ. Prefer the candidate whose
    // wall-clock reads back exactly; if neither does (gap), keep the earlier
    // offset's result, which lands on the next valid instant.
    const readsBack = (ms: number) => Date.UTC(...wallTuple(ms, tz)) === wall;
    if (readsBack(candidate)) utc = candidate;
    else if (!readsBack(utc)) utc = Math.max(utc, candidate);
  }
  return new Date(utc).toISOString();
}

function wallTuple(ms: number, tz: string): [number, number, number, number, number, number] {
  const w = wallClock(ms, tz);
  return [w.year, w.month - 1, w.day, w.hour, w.minute, w.second];
}

/** UTC ISO instant → { date: "YYYY-MM-DD", time: "HH:MM", weekday: 0..6 (Sun=0) } in agency time. */
export function utcIsoToAgencyParts(iso: string, tz: string = AGENCY_TZ): { date: string; time: string; weekday: number } {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`utcIsoToAgencyParts: invalid instant "${iso}"`);
  const w = wallClock(ms, tz);
  return { date: `${w.year}-${pad2(w.month)}-${pad2(w.day)}`, time: `${pad2(w.hour)}:${pad2(w.minute)}`, weekday: w.weekday };
}

export const utcIsoToAgencyDate = (iso: string, tz: string = AGENCY_TZ): string => utcIsoToAgencyParts(iso, tz).date;
export const utcIsoToAgencyTime = (iso: string, tz: string = AGENCY_TZ): string => utcIsoToAgencyParts(iso, tz).time;

/** Today's agency-local date. */
export function agencyTodayIso(tz: string = AGENCY_TZ, now: Date = new Date()): string {
  return utcIsoToAgencyDate(now.toISOString(), tz);
}

/** Pure calendar arithmetic on a YYYY-MM-DD string (no time zone involved). */
export function agencyAddDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD string. */
export function agencyWeekday(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Sunday that starts the Sun–Sat authorization week containing `dateIso` (DECISIONS.md: week basis). */
export function agencySundayOf(dateIso: string): string {
  return agencyAddDays(dateIso, -agencyWeekday(dateIso));
}

/** Monday that starts the Mon–Sun payroll/route-record week containing `dateIso`. */
export function agencyMondayOf(dateIso: string): string {
  return agencyAddDays(dateIso, -((agencyWeekday(dateIso) + 6) % 7));
}

/** UTC instants bounding an agency-local date range, inclusive of both dates. */
export function agencyDayRangeUtc(fromDateIso: string, toDateIso: string, tz: string = AGENCY_TZ): { fromUtc: string; toUtc: string } {
  return {
    fromUtc: agencyToUtcIso(fromDateIso, "00:00:00", tz),
    toUtc: agencyToUtcIso(agencyAddDays(toDateIso, 1), "00:00:00", tz) // exclusive upper bound = next midnight
  };
}

/** Hours between two UTC instants (never negative; cross-midnight safe). */
export function hoursBetweenUtc(startIso: string, endIso: string): number {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  return Number.isNaN(ms) ? 0 : Math.max(0, ms / 3_600_000);
}

/** Whole days from `fromDateIso` to `toDateIso` (calendar difference, sign preserved). */
export function agencyDaysBetween(fromDateIso: string, toDateIso: string): number {
  const [fy, fm, fd] = fromDateIso.split("-").map(Number);
  const [ty, tm, td] = toDateIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// ── Display helpers for SERVER-rendered output ───────────────────────────
// Server components run in the host's zone (UTC on Replit/Vercel), so a bare
// toLocaleTimeString() would print 3:00 PM for a 9:00 AM Denver visit. Pin
// the zone explicitly. Browser code may keep the device zone.

export function formatAgencyTime(iso: string, tz: string = AGENCY_TZ): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export function formatAgencyDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric", year: "numeric" },
  tz: string = AGENCY_TZ
): string {
  return new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: tz });
}

export function formatAgencyDateTime(iso: string, tz: string = AGENCY_TZ): string {
  return new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
}

/** A YYYY-MM-DD calendar date rendered with the given options (no zone math involved). */
export function formatAgencyCalendarDate(dateIso: string, opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" }): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
