// Every sign-in try, recorded.
//
// Two problems with the counter this replaces. It lived in one process's
// memory, so a restart forgave an attack in progress and a second instance
// never saw the first one's failures. And a failure left no trace at all: a
// password-guessing run against a real account was invisible unless it
// succeeded, which is precisely the case you want to know about.
//
// The rows are also the rate limiter's state, so the lock-out now holds across
// restarts and instances.
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { loginAttemptsTable, usersTable, type Db, type LoginOutcome } from "@workspace/db";

/** Outcomes that count against the lock-out. A rate-limited try is not a new guess. */
const COUNTS_AS_FAILURE: ReadonlySet<LoginOutcome> = new Set<LoginOutcome>([
  "invalid_password",
  "unknown_email",
  "suspended",
  "org_suspended",
  "mfa_failed",
]);

export interface AttemptInput {
  email: string;
  ip: string | null;
  userAgent: string | null;
  outcome: LoginOutcome;
  userId?: string | null;
}

export async function recordLoginAttempt(db: Db, input: AttemptInput): Promise<void> {
  await db.insert(loginAttemptsTable).values({
    email: input.email,
    ip: input.ip,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
    outcome: input.outcome,
    userId: input.userId ?? null,
  });
}

export interface LimiterState {
  /** Seconds the caller must wait; 0 when the attempt may proceed. */
  retryAfterSeconds: number;
  /** Consecutive failures inside the window (a success resets the run). */
  failures: number;
}

/**
 * How many failures this address has piled up for this email inside the
 * window, and how long the caller must wait. Counting stops at the most
 * recent success, so someone who signs in correctly is not punished for
 * earlier typos.
 */
export async function checkLoginLimiter(
  db: Db,
  input: { email: string; ip: string | null; maxFailures: number; windowMs: number; now?: Date }
): Promise<LimiterState> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.windowMs);
  const rows = await db
    .select({ outcome: loginAttemptsTable.outcome, createdAt: loginAttemptsTable.createdAt })
    .from(loginAttemptsTable)
    .where(
      and(
        eq(loginAttemptsTable.email, input.email),
        input.ip ? eq(loginAttemptsTable.ip, input.ip) : sql`${loginAttemptsTable.ip} is null`,
        gte(loginAttemptsTable.createdAt, since)
      )
    )
    .orderBy(desc(loginAttemptsTable.createdAt))
    .limit(Math.max(input.maxFailures * 3, 30));

  const run: Date[] = [];
  for (const row of rows) {
    if (row.outcome === "success") break;
    if (COUNTS_AS_FAILURE.has(row.outcome)) run.push(row.createdAt);
  }
  if (run.length < input.maxFailures) return { retryAfterSeconds: 0, failures: run.length };
  // The lock lifts once the oldest failure in the run falls out of the window.
  const oldest = run[run.length - 1]!;
  const readyAt = oldest.getTime() + input.windowMs;
  return {
    retryAfterSeconds: Math.max(1, Math.ceil((readyAt - now.getTime()) / 1000)),
    failures: run.length,
  };
}

export interface BruteForceTarget {
  userId: string | null;
  email: string;
  fullName: string | null;
  failures: number;
  lastAttemptAt: string;
  addresses: number;
}

/**
 * Accounts taking a beating recently, for the console's attention list. Only
 * addresses that match a real account are named: reporting a miss would turn
 * the screen into a way of testing which addresses exist.
 */
export async function recentFailuresByAccount(
  db: Db,
  input: { sinceMs: number; minFailures: number; now?: Date }
): Promise<BruteForceTarget[]> {
  const now = input.now ?? new Date();
  const rows = await db
    .select({
      userId: loginAttemptsTable.userId,
      email: loginAttemptsTable.email,
      fullName: usersTable.fullName,
      failures: count(),
      lastAttemptAt: sql<string>`max(${loginAttemptsTable.createdAt})`,
      addresses: sql<number>`count(distinct ${loginAttemptsTable.ip})`.mapWith(Number),
    })
    .from(loginAttemptsTable)
    .innerJoin(usersTable, eq(usersTable.id, loginAttemptsTable.userId))
    .where(
      and(
        gte(loginAttemptsTable.createdAt, new Date(now.getTime() - input.sinceMs)),
        sql`${loginAttemptsTable.outcome} <> 'success'`
      )
    )
    .groupBy(loginAttemptsTable.userId, loginAttemptsTable.email, usersTable.fullName)
    .having(sql`count(*) >= ${input.minFailures}`);
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    fullName: r.fullName,
    failures: Number(r.failures),
    lastAttemptAt: new Date(r.lastAttemptAt).toISOString(),
    addresses: r.addresses,
  }));
}

export async function pruneLoginAttempts(db: Db, retentionDays: number, now: Date = new Date()): Promise<number> {
  const removed = await db
    .delete(loginAttemptsTable)
    .where(lt(loginAttemptsTable.createdAt, new Date(now.getTime() - retentionDays * 86_400_000)))
    .returning({ id: loginAttemptsTable.id });
  return removed.length;
}
