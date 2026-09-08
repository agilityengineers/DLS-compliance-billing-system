// In-memory failed-login limiter. Good enough for a single API process; move
// the counters to the database or Redis when the API runs on several nodes.

interface Bucket {
  failures: number[];
}

export class LoginLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  private prune(bucket: Bucket): void {
    const cutoff = this.now() - this.windowMs;
    bucket.failures = bucket.failures.filter((t) => t > cutoff);
  }

  /** Seconds the caller must wait, or 0 when the attempt may proceed. */
  retryAfterSeconds(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    this.prune(bucket);
    if (bucket.failures.length < this.maxFailures) return 0;
    const oldest = bucket.failures[0]!;
    return Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000));
  }

  recordFailure(key: string): void {
    const bucket = this.buckets.get(key) ?? { failures: [] };
    this.prune(bucket);
    bucket.failures.push(this.now());
    this.buckets.set(key, bucket);
    // Keep the map from growing without bound on a long-running process.
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        this.prune(b);
        if (b.failures.length === 0) this.buckets.delete(k);
      }
    }
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
