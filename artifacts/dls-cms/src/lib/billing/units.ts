// lib/billing/units.ts — billable unit math
//
// ROUNDING RULE (documented per CMS "8-minute rule" convention):
//   1 unit = 15 minutes.
//   units = floor(minutes / 15), plus 1 additional unit if the remaining
//   minutes are >= 8. i.e. 0–7 leftover minutes round DOWN, 8–14 round UP.
//   Examples: 22 min → 1 unit; 23 min → 2 units; 60 min → 4 units.
// This mirrors the generated column on progress_notes exactly.

export function calculateBillingUnits(startTime: Date | string, endTime: Date | string): number {
  const start = typeof startTime === "string" ? new Date(startTime) : startTime;
  const end = typeof endTime === "string" ? new Date(endTime) : endTime;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const minutes = Math.floor(ms / 60_000);
  const whole = Math.floor(minutes / 15);
  const remainder = minutes % 15;
  return whole + (remainder >= 8 ? 1 : 0);
}

export function unitsToHours(units: number): number {
  return units * 0.25;
}
