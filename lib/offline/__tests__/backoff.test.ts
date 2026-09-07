// lib/offline/__tests__/backoff.test.ts
import { describe, expect, it } from "vitest";
import { backoffMs, SYNC_BACKOFF_BASE_MS, SYNC_BACKOFF_CAP_MS, SYNC_MAX_ATTEMPTS } from "../backoff";

describe("backoffMs", () => {
  it("doubles per attempt from the base, with jitter inside [half, full]", () => {
    for (const attempts of [1, 2, 3, 4, 5]) {
      const full = SYNC_BACKOFF_BASE_MS * 2 ** (attempts - 1);
      expect(backoffMs(attempts, () => 0)).toBe(full / 2);
      expect(backoffMs(attempts, () => 1)).toBe(full);
      const r = backoffMs(attempts);
      expect(r).toBeGreaterThanOrEqual(full / 2);
      expect(r).toBeLessThanOrEqual(full);
    }
  });

  it("never exceeds the cap, however many attempts", () => {
    expect(backoffMs(8, () => 1)).toBe(SYNC_BACKOFF_CAP_MS);
    expect(backoffMs(50, () => 1)).toBe(SYNC_BACKOFF_CAP_MS);
    expect(backoffMs(50, () => 0)).toBe(SYNC_BACKOFF_CAP_MS / 2);
  });

  it("keeps retrying for well over half an hour before parking an item", () => {
    let total = 0;
    for (let a = 1; a < SYNC_MAX_ATTEMPTS; a++) total += backoffMs(a, () => 1);
    expect(total).toBeGreaterThan(30 * 60_000);
  });
});
