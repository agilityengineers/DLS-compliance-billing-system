// Retry pacing for the durable field sync queue.
export const SYNC_MAX_ATTEMPTS = 10;
export const SYNC_BACKOFF_BASE_MS = 5_000;
export const SYNC_BACKOFF_CAP_MS = 10 * 60_000;

export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(
    SYNC_BACKOFF_CAP_MS,
    SYNC_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1),
  );
  return Math.round(exp / 2 + random() * (exp / 2));
}