// Maintenance jobs, and the small scheduler that runs them.
//
// Two things had no home before. Work that must happen on a clock —
// credential-expiry reminders, pruning, verifying the audit chain — had no
// runner at all, so the reminders in the roadmap simply never fired. And the
// question "did it run?" had no answer, because nothing recorded a run.
//
// Every run is claimed through `job_runs` before it starts, so two API
// instances (or the in-process timer and an external cron) cannot double-run
// the same job: the second one finds a recent claim and stands down. Jobs are
// written to be safe even if that race is ever lost — the only outward effect,
// email, is idempotent through its dedupe key.
import { and, desc, eq, gte, isNotNull, lt, or, sql } from "drizzle-orm";
import {
  jobRunsTable,
  organizationsTable,
  requirementsTable,
  sessionsTable,
  staffCredentialsTable,
  supportWindowsTable,
  usersTable,
  type Db,
  type JobRunRow,
} from "@workspace/db";
import type { AppConfig } from "./config";
import { recordAudit } from "./audit";
import { pruneAuthTokens } from "./auth-tokens";
import { pruneLoginAttempts } from "./login-attempts";
import { logger } from "./logger";
import { baaExpiringEmail, credentialExpiryEmail, type Mailer } from "./mail";

export interface JobContext {
  db: Db;
  config: AppConfig;
  mailer: Mailer;
  now: Date;
}

export interface JobOutcome {
  items: number;
  detail: string;
}

export interface JobDefinition {
  name: string;
  description: string;
  /** How often the in-process timer should attempt it. */
  everyMs: number;
  run(ctx: JobContext): Promise<JobOutcome>;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Days before expiry that earn a reminder. 0 is the day it lapses. */
export const CREDENTIAL_REMINDER_DAYS = [30, 14, 3, 0];
export const BAA_REMINDER_DAYS = [60, 30, 7, 0];

/** Whole days from today to an ISO date, in UTC. */
export function daysUntil(dateIso: string, now: Date): number {
  const target = Date.parse(`${dateIso}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Number.isNaN(target)) return Number.NaN;
  return Math.round((target - today) / DAY);
}

// ── the jobs ────────────────────────────────────────────────────────────────

const credentialExpiryReminders: JobDefinition = {
  name: "credential.expiry_reminders",
  description: "Email staff whose licence or required training is about to lapse (30, 14, 3 and 0 days).",
  everyMs: 12 * HOUR,
  async run({ db, mailer, now }) {
    const rows = await db
      .select({
        credentialId: staffCredentialsTable.id,
        expiresOn: staffCredentialsTable.expiresOn,
        requirementLabel: requirementsTable.label,
        required: requirementsTable.required,
        userId: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
        orgId: usersTable.orgId,
        status: usersTable.status,
      })
      .from(staffCredentialsTable)
      .innerJoin(requirementsTable, eq(requirementsTable.id, staffCredentialsTable.requirementId))
      // Demo staff are not accounts, so an inner join quietly skips them.
      .innerJoin(usersTable, eq(usersTable.id, staffCredentialsTable.staffId))
      .where(and(isNotNull(staffCredentialsTable.expiresOn), eq(staffCredentialsTable.status, "verified")));

    let sent = 0;
    for (const row of rows) {
      if (!row.expiresOn || !row.required || row.status !== "Active") continue;
      const remaining = daysUntil(row.expiresOn, now);
      if (!CREDENTIAL_REMINDER_DAYS.includes(remaining)) continue;
      const result = await mailer.send(
        credentialExpiryEmail({
          fullName: row.fullName,
          requirementLabel: row.requirementLabel,
          expiresOn: row.expiresOn,
          daysRemaining: remaining,
          link: mailer.link("/field/training"),
        }),
        {
          to: row.email,
          userId: row.userId,
          orgId: row.orgId,
          dedupeKey: `credential_expiry:${row.credentialId}:${row.expiresOn}:${remaining}`,
        }
      );
      if (result.status !== "deduped") sent += 1;
    }
    return { items: sent, detail: `${rows.length} tracked credentials, ${sent} reminder(s) issued` };
  },
};

const baaReminders: JobDefinition = {
  name: "org.baa_reminders",
  description: "Warn an organization's administrators before its Business Associate Agreement lapses.",
  everyMs: 12 * HOUR,
  async run({ db, mailer, now }) {
    const orgs = await db
      .select()
      .from(organizationsTable)
      .where(and(isNotNull(organizationsTable.baaExpiresOn), eq(organizationsTable.status, "active")));
    let sent = 0;
    for (const org of orgs) {
      if (!org.baaExpiresOn) continue;
      const remaining = daysUntil(org.baaExpiresOn, now);
      if (!BAA_REMINDER_DAYS.includes(remaining)) continue;
      const admins = await db
        .select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
        .from(usersTable)
        .where(and(eq(usersTable.orgId, org.id), eq(usersTable.role, "Admin"), eq(usersTable.status, "Active")));
      for (const admin of admins) {
        const result = await mailer.send(
          baaExpiringEmail({
            adminName: admin.fullName,
            orgName: org.name,
            expiresOn: org.baaExpiresOn,
            daysRemaining: remaining,
          }),
          {
            to: admin.email,
            userId: admin.id,
            orgId: org.id,
            dedupeKey: `baa_expiry:${org.id}:${org.baaExpiresOn}:${remaining}:${admin.id}`,
          }
        );
        if (result.status !== "deduped") sent += 1;
      }
    }
    return { items: sent, detail: `${orgs.length} organization(s) with a recorded BAA, ${sent} warning(s) issued` };
  },
};

const verifyAuditChain: JobDefinition = {
  name: "audit.verify_chain",
  description: "Recompute the audit log's hash chain and report the first break, if any.",
  everyMs: 24 * HOUR,
  async run({ db }) {
    const result = await db.execute(sql`select * from audit_log_verify()`);
    const row = result.rows[0] as unknown as {
      checked: string | number;
      ok: boolean;
      first_bad_seq: string | number | null;
    };
    const checked = Number(row?.checked ?? 0);
    if (!row?.ok) {
      // Loud: a broken chain means somebody edited history, or a bug did.
      logger.error({ firstBadSeq: row?.first_bad_seq }, "Audit log chain verification FAILED");
      throw new Error(`Audit chain broken at entry ${row?.first_bad_seq ?? "unknown"} (${checked} checked).`);
    }
    return { items: checked, detail: `${checked} entries verified, chain intact` };
  },
};

const expireSupportWindows: JobDefinition = {
  name: "support.close_windows",
  description: "Record support windows that have run out, so the closing is in the audit log too.",
  everyMs: HOUR,
  async run({ db, now }) {
    const lastRun = await db
      .select({ startedAt: jobRunsTable.startedAt })
      .from(jobRunsTable)
      .where(and(eq(jobRunsTable.name, "support.close_windows"), eq(jobRunsTable.ok, true)))
      .orderBy(desc(jobRunsTable.startedAt))
      .limit(1);
    const since = lastRun[0]?.startedAt ?? new Date(now.getTime() - 7 * DAY);
    const closed = await db
      .select()
      .from(supportWindowsTable)
      .where(and(lt(supportWindowsTable.expiresAt, now), gte(supportWindowsTable.expiresAt, since)));
    for (const w of closed) {
      if (w.revokedAt) continue;
      await recordAudit(db, {
        orgId: w.orgId,
        actorUserId: null,
        action: "support.window_expired",
        targetType: "support_window",
        targetId: w.id,
        details: { reason: w.reason, expiredAt: w.expiresAt.toISOString() },
      });
    }
    return { items: closed.length, detail: `${closed.length} window(s) closed since the last run` };
  },
};

const pruneSessions: JobDefinition = {
  name: "sessions.prune",
  description: "Delete sessions that expired or were revoked long enough ago to be of no further use.",
  everyMs: 24 * HOUR,
  async run({ db, now }) {
    const cutoff = new Date(now.getTime() - 30 * DAY);
    const removed = await db
      .delete(sessionsTable)
      .where(or(lt(sessionsTable.expiresAt, cutoff), lt(sessionsTable.revokedAt, cutoff)))
      .returning({ id: sessionsTable.id });
    return { items: removed.length, detail: `${removed.length} stale session row(s) removed` };
  },
};

const pruneSignInAttempts: JobDefinition = {
  name: "login_attempts.prune",
  description: "Keep sign-in attempts for the retention period, then drop them.",
  everyMs: 24 * HOUR,
  async run({ db, config, now }) {
    const removed = await pruneLoginAttempts(db, config.loginAttemptRetentionDays, now);
    return { items: removed, detail: `${removed} attempt row(s) older than ${config.loginAttemptRetentionDays} days removed` };
  },
};

const pruneTokens: JobDefinition = {
  name: "auth_tokens.prune",
  description: "Drop invitation and reset links that have expired or been used.",
  everyMs: 24 * HOUR,
  async run({ db, now }) {
    const removed = await pruneAuthTokens(db, now);
    return { items: removed, detail: `${removed} spent or expired link(s) removed` };
  },
};

export const JOBS: readonly JobDefinition[] = [
  credentialExpiryReminders,
  baaReminders,
  verifyAuditChain,
  expireSupportWindows,
  pruneSessions,
  pruneSignInAttempts,
  pruneTokens,
];

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((j) => j.name === name);
}

// ── running them ────────────────────────────────────────────────────────────

export type JobTrigger = "schedule" | "manual" | "cron";

export interface JobRunResult {
  name: string;
  ran: boolean;
  ok?: boolean;
  items?: number;
  detail?: string;
  /** Set when another instance had already run it recently. */
  skipped?: "recently_ran";
}

/**
 * Claim a run. The insert only lands when no run of this job started inside
 * `minIntervalMs`, which is what stops a second instance repeating the work.
 * A person pressing "Run now" passes `force`.
 */
async function claimRun(
  db: Db,
  name: string,
  trigger: JobTrigger,
  minIntervalMs: number,
  force: boolean
): Promise<string | null> {
  const rows = await db.execute(sql`
    insert into job_runs (name, trigger)
    select ${name}, ${trigger}
    where ${force} or not exists (
      select 1 from job_runs
      where name = ${name} and started_at > now() - ${sql.raw(`interval '${Math.max(1, Math.round(minIntervalMs / 1000))} seconds'`)}
    )
    returning id
  `);
  const row = rows.rows[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

export async function runJob(
  ctx: Omit<JobContext, "now">,
  name: string,
  trigger: JobTrigger = "manual"
): Promise<JobRunResult> {
  const job = findJob(name);
  if (!job) throw new Error(`Unknown job: ${name}`);
  const force = trigger !== "schedule";
  // A scheduled attempt only counts as "already ran" inside most of its own
  // period, so a slightly early timer tick does not skip a cycle.
  const runId = await claimRun(ctx.db, job.name, trigger, job.everyMs * 0.8, force);
  if (!runId) return { name: job.name, ran: false, skipped: "recently_ran" };

  const now = new Date();
  try {
    const outcome = await job.run({ ...ctx, now });
    await ctx.db
      .update(jobRunsTable)
      .set({ finishedAt: new Date(), ok: true, itemsProcessed: outcome.items, detail: outcome.detail })
      .where(eq(jobRunsTable.id, runId));
    logger.info({ job: job.name, items: outcome.items }, "Job finished");
    return { name: job.name, ran: true, ok: true, items: outcome.items, detail: outcome.detail };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await ctx.db
      .update(jobRunsTable)
      .set({ finishedAt: new Date(), ok: false, detail })
      .where(eq(jobRunsTable.id, runId));
    logger.error({ job: job.name, err: detail }, "Job failed");
    return { name: job.name, ran: true, ok: false, detail };
  }
}

export interface JobStatus {
  name: string;
  description: string;
  everyMinutes: number;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    ok: boolean | null;
    itemsProcessed: number;
    detail: string | null;
    trigger: string;
  } | null;
}

export async function jobStatuses(db: Db): Promise<JobStatus[]> {
  const rows = await db
    .select()
    .from(jobRunsTable)
    .orderBy(desc(jobRunsTable.startedAt))
    .limit(200);
  const latest = new Map<string, JobRunRow>();
  for (const row of rows) if (!latest.has(row.name)) latest.set(row.name, row);
  return JOBS.map((job) => {
    const run = latest.get(job.name);
    return {
      name: job.name,
      description: job.description,
      everyMinutes: Math.round(job.everyMs / 60_000),
      lastRun: run
        ? {
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
            ok: run.ok,
            itemsProcessed: run.itemsProcessed,
            detail: run.detail,
            trigger: run.trigger,
          }
        : null,
    };
  });
}

/**
 * The in-process timer.
 *
 * Deliberately modest: it wakes every SCHEDULER_INTERVAL_MINUTES and asks each
 * job whether it is due. On a host that sleeps idle instances this can miss a
 * window, which is why `POST /api/jobs/:name/run` exists for an external cron
 * to drive the same jobs with a shared secret. Turn this off
 * (SCHEDULER_ENABLED=false) when something else is driving them.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(private readonly ctx: Omit<JobContext, "now">) {}

  start(): void {
    if (!this.ctx.config.schedulerEnabled || this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.ctx.config.schedulerIntervalMs);
    // Long timers keep the process alive for no reason during a graceful stop.
    this.timer.unref?.();
    logger.info(
      { everyMinutes: Math.round(this.ctx.config.schedulerIntervalMs / 60_000), jobs: JOBS.length },
      "Maintenance scheduler started"
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One pass over every job. Exposed so a test can drive it without waiting. */
  async tick(): Promise<JobRunResult[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const results: JobRunResult[] = [];
      for (const job of JOBS) {
        try {
          results.push(await runJob(this.ctx, job.name, "schedule"));
        } catch (e) {
          logger.error({ job: job.name, err: e }, "Scheduler tick failed");
        }
      }
      return results;
    } finally {
      this.running = false;
    }
  }
}
