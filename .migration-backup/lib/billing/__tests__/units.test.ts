// lib/billing/__tests__/units.test.ts
import { describe, it, expect } from "vitest";
import { calculateBillingUnits } from "../units";

const at = (min: number) => {
  const start = new Date("2026-06-01T09:00:00Z");
  const end = new Date(start.getTime() + min * 60_000);
  return [start, end] as const;
};

describe("calculateBillingUnits — 15-min units, 8-minute rounding rule", () => {
  it("0–7 leftover minutes round down", () => {
    expect(calculateBillingUnits(...at(7))).toBe(0);
    expect(calculateBillingUnits(...at(22))).toBe(1);   // 15 + 7
    expect(calculateBillingUnits(...at(15))).toBe(1);
  });
  it("8–14 leftover minutes round up", () => {
    expect(calculateBillingUnits(...at(8))).toBe(1);
    expect(calculateBillingUnits(...at(23))).toBe(2);   // 15 + 8
    expect(calculateBillingUnits(...at(14))).toBe(1);
  });
  it("exact multiples", () => {
    expect(calculateBillingUnits(...at(60))).toBe(4);
    expect(calculateBillingUnits(...at(90))).toBe(6);
  });
  it("zero / negative durations yield 0", () => {
    expect(calculateBillingUnits(...at(0))).toBe(0);
    const [s, e] = at(30);
    expect(calculateBillingUnits(e, s)).toBe(0);
  });
});
