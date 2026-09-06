// lib/offline/backoff.ts — retry pacing for the sync queue (pure; unit-tested).
// Transient failures back off exponentially with jitter up to a cap. An item
// is never deleted: after SYNC_MAX_ATTEMPTS it moves to the durable
// sync_failed list, where the user can retry it (lib/offline/syncEngine.ts).
export const SYNC_MAX_ATTEMPTS = 10;
export const SYNC_BACKOFF_BASE_MS = 5_000;
export const SYNC_BACKOFF_CAP_MS = 10 * 60_000;

/** Delay before the next push after `attempts` failed pushes (attempts ≥ 1). */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(SYNC_BACKOFF_CAP_MS, SYNC_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  // Jitter within [exp/2, exp]: devices coming back after one outage do not
  // all retry in the same second.
  return Math.round(exp / 2 + random() * (exp / 2));
}
