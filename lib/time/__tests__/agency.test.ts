// lib/time/__tests__/agency.test.ts — agency-local ⇄ UTC, including both DST edges.
import { describe, expect, it } from "vitest";
import {
  agencyAddDays, agencyDayRangeUtc, agencyMondayOf, agencySundayOf, agencyToUtcIso, agencyTodayIso,
  agencyWeekday, hoursBetweenUtc, utcIsoToAgencyDate, utcIsoToAgencyParts, utcIsoToAgencyTime
} from "../agency";

const TZ = "America/Denver";

describe("agencyToUtcIso", () => {
  it("converts MST (winter) and MDT (summer) wall-clock times", () => {
    expect(agencyToUtcIso("2026-01-15", "09:00", TZ)).toBe("2026-01-15T16:00:00.000Z"); // UTC-7
    expect(agencyToUtcIso("2026-07-06", "09:00", TZ)).toBe("2026-07-06T15:00:00.000Z"); // UTC-6
  });
  it("an evening visit stays on its agency date in UTC terms", () => {
    // 6 pm Denver in July = 00:00 UTC next day — the exact case that zeroed payroll hours.
    expect(agencyToUtcIso("2026-07-06", "18:00", TZ)).toBe("2026-07-07T00:00:00.000Z");
  });
  it("spring-forward gap (2026-03-08 02:30 does not exist) resolves forward", () => {
    const iso = agencyToUtcIso("2026-03-08", "02:30", TZ);
    expect(iso).toBe("2026-03-08T09:30:00.000Z"); // = 03:30 MDT, the next valid instant
  });
  it("fall-back overlap (2026-11-01 01:30 occurs twice) resolves to the first occurrence (MDT)", () => {
    expect(agencyToUtcIso("2026-11-01", "01:30", TZ)).toBe("2026-11-01T07:30:00.000Z");
  });
  it("accepts HH:MM:SS", () => {
    expect(agencyToUtcIso("2026-07-06", "09:01:30", TZ)).toBe("2026-07-06T15:01:30.000Z");
  });
});

describe("utcIsoToAgency*", () => {
  it("returns the agency date and time, not the UTC ones", () => {
    const p = utcIsoToAgencyParts("2026-07-07T00:30:00Z", TZ);
    expect(p).toEqual({ date: "2026-07-06", time: "18:30", weekday: 1 }); // Monday evening in Denver
    expect(utcIsoToAgencyDate("2026-07-07T00:30:00Z", TZ)).toBe("2026-07-06");
    expect(utcIsoToAgencyTime("2026-07-07T00:30:00Z", TZ)).toBe("18:30");
  });
  it("handles PostgREST's +00:00 suffix and naive strings the same way as Z", () => {
    expect(utcIsoToAgencyDate("2026-07-07T00:30:00+00:00", TZ)).toBe("2026-07-06");
  });
  it("round-trips through agencyToUtcIso", () => {
    for (const [d, t] of [["2026-02-01", "23:59"], ["2026-06-15", "00:00"], ["2026-12-31", "12:00"]]) {
      const p = utcIsoToAgencyParts(agencyToUtcIso(d, t, TZ), TZ);
      expect([p.date, p.time]).toEqual([d, t]);
    }
  });
});

describe("calendar helpers", () => {
  it("adds days across month and year ends without time-zone drift", () => {
    expect(agencyAddDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(agencyAddDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(agencyAddDays("2026-03-08", -1)).toBe("2026-03-07"); // DST day: still exactly one day
  });
  it("weekday, Sun–Sat and Mon–Sun week starts", () => {
    expect(agencyWeekday("2026-09-05")).toBe(6); // Saturday
    expect(agencySundayOf("2026-09-05")).toBe("2026-08-30");
    expect(agencySundayOf("2026-08-30")).toBe("2026-08-30");
    expect(agencyMondayOf("2026-09-05")).toBe("2026-08-31");
    expect(agencyMondayOf("2026-09-06")).toBe("2026-08-31"); // Sunday belongs to the week that started Monday
  });
  it("agencyTodayIso follows the agency clock, not the server's", () => {
    expect(agencyTodayIso(TZ, new Date("2026-07-07T03:00:00Z"))).toBe("2026-07-06"); // 9 pm Denver
    expect(agencyTodayIso(TZ, new Date("2026-07-07T07:00:00Z"))).toBe("2026-07-07"); // 1 am Denver
  });
  it("day range bounds are agency midnights in UTC, upper bound exclusive", () => {
    expect(agencyDayRangeUtc("2026-07-06", "2026-07-06", TZ)).toEqual({
      fromUtc: "2026-07-06T06:00:00.000Z", toUtc: "2026-07-07T06:00:00.000Z"
    });
  });
});

describe("hoursBetweenUtc", () => {
  it("is cross-midnight safe — the payroll case", () => {
    const start = agencyToUtcIso("2026-07-06", "16:00", TZ);
    const end = agencyToUtcIso("2026-07-06", "17:30", TZ);
    expect(hoursBetweenUtc(start, end)).toBe(1.5);
    expect(utcIsoToAgencyDate(start, TZ)).toBe("2026-07-06");
  });
  it("never returns a negative", () => {
    expect(hoursBetweenUtc("2026-07-06T10:00:00Z", "2026-07-06T09:00:00Z")).toBe(0);
  });
});
