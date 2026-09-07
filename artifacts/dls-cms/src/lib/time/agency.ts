// The single boundary between agency-local calendar values and UTC instants.
// Timestamps are stored as UTC; visit days, weeks, and "today" use agency time.
export const DEFAULT_AGENCY_TZ = "America/Denver";
export const AGENCY_TZ: string =
  process.env.NEXT_PUBLIC_AGENCY_TIMEZONE || DEFAULT_AGENCY_TZ;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let value = fmtCache.get(tz);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, value);
  }
  return value;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const WEEKDAY: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function wallClock(utcMs: number, tz: string): WallClock {
  const parts: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(new Date(utcMs))) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY[parts.weekday] ?? 0,
  };
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const w = wallClock(utcMs, tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
    - Math.floor(utcMs / 1000) * 1000;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function wallTuple(ms: number, tz: string): [number, number, number, number, number, number] {
  const w = wallClock(ms, tz);
  return [w.year, w.month - 1, w.day, w.hour, w.minute, w.second];
}

export function agencyToUtcIso(dateIso: string, hhmm: string, tz: string = AGENCY_TZ): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm, ss = 0] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
  let utc = wall - tzOffsetMs(wall, tz);
  const candidate = wall - tzOffsetMs(utc, tz);
  if (candidate !== utc) {
    const readsBack = (ms: number) => Date.UTC(...wallTuple(ms, tz)) === wall;
    if (readsBack(candidate)) utc = candidate;
    else if (!readsBack(utc)) utc = Math.max(utc, candidate);
  }
  return new Date(utc).toISOString();
}

export function utcIsoToAgencyParts(
  iso: string,
  tz: string = AGENCY_TZ,
): { date: string; time: string; weekday: number } {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`utcIsoToAgencyParts: invalid instant "${iso}"`);
  const w = wallClock(ms, tz);
  return {
    date: `${w.year}-${pad2(w.month)}-${pad2(w.day)}`,
    time: `${pad2(w.hour)}:${pad2(w.minute)}`,
    weekday: w.weekday,
  };
}

export const utcIsoToAgencyDate = (iso: string, tz: string = AGENCY_TZ) =>
  utcIsoToAgencyParts(iso, tz).date;
export const utcIsoToAgencyTime = (iso: string, tz: string = AGENCY_TZ) =>
  utcIsoToAgencyParts(iso, tz).time;

export function agencyTodayIso(tz: string = AGENCY_TZ, now: Date = new Date()): string {
  return utcIsoToAgencyDate(now.toISOString(), tz);
}

export function agencyAddDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

export function agencyWeekday(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function agencySundayOf(dateIso: string): string {
  return agencyAddDays(dateIso, -agencyWeekday(dateIso));
}

export function agencyMondayOf(dateIso: string): string {
  return agencyAddDays(dateIso, -((agencyWeekday(dateIso) + 6) % 7));
}

export function agencyDayRangeUtc(
  fromDateIso: string,
  toDateIso: string,
  tz: string = AGENCY_TZ,
): { fromUtc: string; toUtc: string } {
  return {
    fromUtc: agencyToUtcIso(fromDateIso, "00:00:00", tz),
    toUtc: agencyToUtcIso(agencyAddDays(toDateIso, 1), "00:00:00", tz),
  };
}

export function hoursBetweenUtc(startIso: string, endIso: string): number {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  return Number.isNaN(ms) ? 0 : Math.max(0, ms / 3_600_000);
}

export function agencyDaysBetween(fromDateIso: string, toDateIso: string): number {
  const [fy, fm, fd] = fromDateIso.split("-").map(Number);
  const [ty, tm, td] = toDateIso.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export function formatAgencyTime(iso: string, tz: string = AGENCY_TZ): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: tz,
  });
}

export function formatAgencyDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric", year: "numeric" },
  tz: string = AGENCY_TZ,
): string {
  return new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: tz });
}

export function formatAgencyDateTime(iso: string, tz: string = AGENCY_TZ): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz,
  });
}

export function formatAgencyCalendarDate(
  dateIso: string,
  opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(
    "en-US",
    { ...opts, timeZone: "UTC" },
  );
}