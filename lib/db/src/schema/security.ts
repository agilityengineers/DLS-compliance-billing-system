// Security and operations tables that sit beside the access model:
//
//   login_attempts   every sign-in try, so a failed one leaves a trace and the
//                    lock-out counter survives a restart and works across
//                    instances (the in-memory counter did neither)
//   auth_tokens      single-use invitation, password-reset and pending-MFA
//                    tokens; only their hashes are stored
//   support_windows  an organization Admin's time-boxed grant of provider
//                    access (review decision D-02) — without an open window
//                    the provider cannot view as anyone in that organization
//   job_runs         the maintenance scheduler's history, so "did the nightly
//                    sweep run" is answerable from the console
//   mail_outbox      one row per message the system tried to send; subject and
//                    recipient only, never a body, and never PHI
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable, usersTable } from "./access";

/** Why a sign-in ended the way it did. `success` rows make the rate window forgiving. */
export const LOGIN_OUTCOMES = [
  "success",
  "invalid_password",
  "unknown_email",
  "suspended",
  "org_suspended",
  "rate_limited",
  "mfa_required",
  "mfa_failed",
] as const;
export type LoginOutcome = (typeof LOGIN_OUTCOMES)[number];

export const loginAttemptsTable = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lower-cased email as typed. Kept even when no account matches, so a
     *  spray across many addresses is visible; the audit log never names an
     *  address that has no account, which would turn it into a directory. */
    email: text("email").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    outcome: text("outcome").$type<LoginOutcome>().notNull(),
    /** Set when the address matched an account. */
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The limiter's query: failures for this email+ip inside the window.
    index("idx_login_attempts_email_created").on(t.email, t.createdAt),
    index("idx_login_attempts_created").on(t.createdAt),
  ]
);

export const AUTH_TOKEN_PURPOSES = ["invite", "password_reset", "mfa_pending"] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

export const authTokensTable = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<AuthTokenPurpose>().notNull(),
    /** sha256 of the token in the link — the raw value never touches the database. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** Null for a token the person requested themselves (forgot password). */
    createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_auth_tokens_user_purpose").on(t.userId, t.purpose)]
);

export const supportWindowsTable = pgTable(
  "support_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** The Admin who opened the door. Always an account inside `orgId`. */
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    /** Required: a window without a stated reason is not an informed grant. */
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_support_windows_org_expires").on(t.orgId, t.expiresAt)]
);

export const jobRunsTable = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Registered job name, e.g. "credential.expiry_reminders". */
    name: text("name").notNull(),
    /** "schedule" (the in-process timer), "manual" (a provider pressed Run) or "cron" (an external caller). */
    trigger: text("trigger").notNull().default("schedule"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: boolean("ok"),
    /** How many things the run acted on — reminders sent, rows pruned. */
    itemsProcessed: integer("items_processed").notNull().default(0),
    /** One line for the console: what happened, or why it failed. */
    detail: text("detail"),
  },
  (t) => [index("idx_job_runs_name_started").on(t.name, t.startedAt)]
);

/**
 * `pending` is written before the transport is called, which is what makes
 * `dedupe_key` a reservation rather than a record after the fact: a retried
 * job loses the race on the unique index instead of sending twice.
 */
export const MAIL_STATUSES = [
  "pending",
  "sent",
  "logged",
  "failed",
  "blocked_phi",
  "deduped",
  "suppressed",
] as const;
export type MailStatus = (typeof MAIL_STATUSES)[number];

export const mailOutboxTable = pgTable(
  "mail_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Template key, e.g. "account.invite". */
    kind: text("kind").notNull(),
    /** Sender desk the template declares (noreply, staff, schedule, partner). */
    sender: text("sender").notNull(),
    recipient: text("recipient").notNull(),
    /** Subject only. Bodies are never stored: they carry links, and one day names. */
    subject: text("subject").notNull(),
    status: text("status").$type<MailStatus>().notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    /** Set once per logical message so a retried job cannot double-send. */
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_mail_outbox_dedupe").on(t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
    index("idx_mail_outbox_created").on(t.createdAt),
  ]
);

export type LoginAttemptRow = typeof loginAttemptsTable.$inferSelect;
export type AuthTokenRow = typeof authTokensTable.$inferSelect;
export type SupportWindowRow = typeof supportWindowsTable.$inferSelect;
export type JobRunRow = typeof jobRunsTable.$inferSelect;
export type MailOutboxRow = typeof mailOutboxTable.$inferSelect;
