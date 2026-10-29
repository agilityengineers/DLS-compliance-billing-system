// lib/db/src/schema/leads.ts — website inquiries and the path from inquiry to
// client.
//
//   lead_stages          the funnel, one row per stage, ordered; the admin owns
//                        the labels and the order, three stages are structural
//                        (new = where submissions land, converted = became a
//                        client, closed = did not)
//   lead_form_questions  the public form, one row per question; the admin adds,
//                        edits, reorders and retires questions without a deploy
//   leads                one row per inquiry, with the answers as given and a
//                        snapshot of the questions as they were, so an answer
//                        stays readable after its question is edited or retired
//   lead_activities      what happened to the lead and when: the timeline the
//                        inbox shows, including notes
//   lead_submission_attempts
//                        every attempt the website made, whatever came of it:
//                        the per-address limiter counts these, so a flood of
//                        retries or bad answers is limited like a flood of
//                        inquiries, and a retry of a dropped receipt is found
//                        by its key rather than guessed from the email
//
// Everything is scoped to an organization. The submitting IP is kept only for
// the rate limiter and is scrubbed by a job, like login_attempts.
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable, usersTable } from "./access";
import { clientsTable } from "./clients";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** open = still being worked; won = became a client; lost = closed without converting. */
export const LEAD_STAGE_KINDS = ["open", "won", "lost"] as const;
export type LeadStageKind = (typeof LEAD_STAGE_KINDS)[number];

export const LEAD_QUESTION_TYPES = ["short_text", "long_text", "email", "phone", "select", "yes_no"] as const;
export type LeadQuestionType = (typeof LEAD_QUESTION_TYPES)[number];

export const LEAD_SOURCES = ["website", "manual"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_CLOSED_REASONS = ["not_a_fit", "no_response", "duplicate", "other"] as const;
export type LeadClosedReason = (typeof LEAD_CLOSED_REASONS)[number];

export const LEAD_ACTIVITY_TYPES = ["submitted", "stage_changed", "assigned", "note", "converted"] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

/** The question as it was when the lead answered it. */
export interface LeadQuestionSnapshot {
  key: string;
  label: string;
  type: LeadQuestionType;
}

/** Answers keyed by question key. yes_no answers are booleans; everything else is text. */
export type LeadAnswers = Record<string, string | boolean | null>;

export const leadStagesTable = pgTable(
  "lead_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** Stable slug; never changes once created, so reports can rely on it. */
    key: text("key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: text("kind").$type<LeadStageKind>().notNull().default("open"),
    /** Structural stages (new, converted, closed): relabel and reorder, never remove. */
    isSystem: boolean("is_system").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("uq_lead_stages_org_key").on(t.orgId, t.key),
    index("idx_lead_stages_org_sort").on(t.orgId, t.sortOrder),
    check("lead_stages_kind_check", sql`${t.kind} in ('open', 'won', 'lost')`),
  ]
);

export const leadFormQuestionsTable = pgTable(
  "lead_form_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** Stable slug; the answers on every lead are keyed by it. */
    key: text("key").notNull(),
    label: text("label").notNull(),
    helpText: text("help_text"),
    type: text("type").$type<LeadQuestionType>().notNull(),
    /** Choices for a `select` question; empty otherwise. */
    options: jsonb("options").$type<string[]>().notNull().default([]),
    required: boolean("required").notNull().default(false),
    /** Identity and consent questions the inbox depends on: editable wording, fixed shape. */
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Retired questions stay so old answers keep their wording. */
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("uq_lead_form_questions_org_key").on(t.orgId, t.key),
    index("idx_lead_form_questions_org_sort").on(t.orgId, t.sortOrder),
    check(
      "lead_form_questions_type_check",
      sql`${t.type} in ('short_text', 'long_text', 'email', 'phone', 'select', 'yes_no')`
    ),
  ]
);

export const leadsTable = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => leadStagesTable.id, { onDelete: "restrict" }),
    // Promoted out of `answers` so the inbox can list, search and de-duplicate
    // without opening every row's JSON.
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    answers: jsonb("answers").$type<LeadAnswers>().notNull().default({}),
    questionSnapshot: jsonb("question_snapshot").$type<LeadQuestionSnapshot[]>().notNull().default([]),
    source: text("source").$type<LeadSource>().notNull().default("website"),
    /** Path of the page the form was on (never the query string). */
    sourcePage: text("source_page"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    closedReason: text("closed_reason").$type<LeadClosedReason>(),
    convertedClientId: uuid("converted_client_id").references(() => clientsTable.id, { onDelete: "set null" }),
    /** Kept for the rate limiter only; nulled by the leads.scrub_ip job. */
    ip: text("ip"),
    /**
     * The website's idempotency key for the submission that created this row.
     * A later attempt carrying the same key is a retry of this inquiry, not a
     * new one, however many times the network drops the receipt.
     */
    submissionId: text("submission_id"),
    /** SHA-256 of the answers as given, so an identical re-send without a key is still a retry. */
    submissionFingerprint: text("submission_fingerprint"),
    /**
     * Where an imported row came from (`consultation_requests`) and its id
     * there. One lead per source row, enforced by uq_leads_import_source, so
     * two processes importing the same table cannot both bring a row in.
     */
    importSource: text("import_source"),
    importSourceId: text("import_source_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    index("idx_leads_org_stage").on(t.orgId, t.stageId),
    index("idx_leads_org_created").on(t.orgId, t.createdAt),
    index("idx_leads_org_email").on(t.orgId, t.email),
    index("idx_leads_org_ip_created").on(t.orgId, t.ip, t.createdAt),
    // A retry can only ever match one inquiry.
    uniqueIndex("uq_leads_org_submission").on(t.orgId, t.submissionId).where(sql`${t.submissionId} is not null`),
    // A legacy row is imported once, whichever boot gets to it first.
    uniqueIndex("uq_leads_import_source").on(t.importSource, t.importSourceId).where(sql`${t.importSource} is not null`),
    // A client comes from at most one inquiry (clients.source_lead_id is the other half).
    uniqueIndex("uq_leads_converted_client").on(t.convertedClientId).where(sql`${t.convertedClientId} is not null`),
    check("leads_source_check", sql`${t.source} in ('website', 'manual')`),
    check(
      "leads_closed_reason_check",
      sql`${t.closedReason} is null or ${t.closedReason} in ('not_a_fit', 'no_response', 'duplicate', 'other')`
    ),
  ]
);

export const leadActivitiesTable = pgTable(
  "lead_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    type: text("type").$type<LeadActivityType>().notNull(),
    /** Free text for a `note`; null otherwise. */
    note: text("note"),
    /** Identifiers only (stage ids, user ids, client id) — never a person's details. */
    details: jsonb("details").$type<Record<string, unknown>>(),
    /** Null for the website submission itself. */
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_lead_activities_lead_created").on(t.leadId, t.createdAt),
    check(
      "lead_activities_type_check",
      sql`${t.type} in ('submitted', 'stage_changed', 'assigned', 'note', 'converted')`
    ),
  ]
);

/** What came of one website attempt. */
export const LEAD_SUBMISSION_OUTCOMES = ["created", "retry", "invalid", "rate_limited", "ignored"] as const;
export type LeadSubmissionOutcome = (typeof LEAD_SUBMISSION_OUTCOMES)[number];

export const leadSubmissionAttemptsTable = pgTable(
  "lead_submission_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** The submitting address; pruned by the leads.scrub_ip job with the leads' own. */
    ip: text("ip"),
    /** The website's idempotency key, when the attempt carried one. */
    submissionId: text("submission_id"),
    outcome: text("outcome").$type<LeadSubmissionOutcome>().notNull(),
    /** The inquiry the attempt created or retried; null for an attempt that stored nothing. */
    leadId: uuid("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The limiter's query: attempts from this address inside the window.
    index("idx_lead_submission_attempts_org_ip_created").on(t.orgId, t.ip, t.createdAt),
    check(
      "lead_submission_attempts_outcome_check",
      sql`${t.outcome} in ('created', 'retry', 'invalid', 'rate_limited', 'ignored')`
    ),
  ]
);

export type LeadStageRow = typeof leadStagesTable.$inferSelect;
export type LeadFormQuestionRow = typeof leadFormQuestionsTable.$inferSelect;
export type LeadRow = typeof leadsTable.$inferSelect;
export type LeadActivityRow = typeof leadActivitiesTable.$inferSelect;
export type LeadSubmissionAttemptRow = typeof leadSubmissionAttemptsTable.$inferSelect;
