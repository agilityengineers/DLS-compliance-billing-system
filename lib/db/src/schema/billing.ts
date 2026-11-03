// lib/db/src/schema/billing.ts — what billing is configured with and what it
// has sent.
//
//   payers             who gets billed: Colorado Medicaid, DVR, a private
//                      payer; the receiver id and claim filing code the 837P
//                      envelope carries for each
//   billing_codes      the fee schedule: a procedure code with its modifiers,
//                      the service it bills, the unit it is counted in, the
//                      rate, and the dates the rate holds; archived codes stay
//                      so old claims keep their meaning
//   claim_submissions  the ledger of every 837P batch: control number, payer,
//                      what went in it, the file itself, and what the payer
//                      said back (submitted → accepted / rejected → paid /
//                      denied, or voided). A row is opened before the file is
//                      built and finalized only once the file exists, so a
//                      note is never marked billed without a stored file.
import { bigserial, boolean, check, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable, usersTable } from "./access";

export const PAYER_KINDS = ["medicaid", "dvr", "private", "other"] as const;
export type PayerKind = (typeof PAYER_KINDS)[number];

/** SBR09 on the claim: MC Medicaid, CI commercial, OF other federal, 11 other non-federal. */
export const CLAIM_FILING_CODES = ["MC", "CI", "OF", "11"] as const;
export type ClaimFilingCode = (typeof CLAIM_FILING_CODES)[number];

/** The services DLS bills, plus transportation and a catch-all; the same list the authorizations use. */
export const BILLING_SERVICES = ["SCC", "Job_Coaching", "Day_Habilitation", "Early_Intervention", "NMT", "Other"] as const;
export type BillingService = (typeof BILLING_SERVICES)[number];

/** What one billed unit is. Claim readiness counts 15-minute units; the others are for codes billed differently. */
export const BILLING_UNITS = ["15_min", "hour", "day", "trip", "each"] as const;
export type BillingUnit = (typeof BILLING_UNITS)[number];

export const SUBMISSION_STATUSES = ["open", "submitted", "accepted", "rejected", "paid", "denied", "voided"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const payersTable = pgTable(
  "payers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<PayerKind>().notNull().default("medicaid"),
    /** The receiver / payer id from the trading-partner agreement (ISA08, GS03, NM1*PR). */
    payerId: text("payer_id"),
    claimFilingCode: text("claim_filing_code").$type<ClaimFilingCode>().notNull().default("MC"),
    address1: text("address1"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    phone: text("phone"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("uq_payers_org_name").on(t.orgId, t.name),
    check("payers_kind_check", sql`${t.kind} in ('medicaid', 'dvr', 'private', 'other')`),
    check("payers_filing_check", sql`${t.claimFilingCode} in ('MC', 'CI', 'OF', '11')`),
  ]
);

export const billingCodesTable = pgTable(
  "billing_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** Null means the code applies whoever the payer is. */
    payerId: uuid("payer_id").references(() => payersTable.id, { onDelete: "set null" }),
    /** HCPCS / CPT, e.g. T2021. */
    code: text("code").notNull(),
    modifier1: text("modifier1"),
    modifier2: text("modifier2"),
    modifier3: text("modifier3"),
    modifier4: text("modifier4"),
    description: text("description").notNull(),
    service: text("service").$type<BillingService>().notNull(),
    billingUnit: text("billing_unit").$type<BillingUnit>().notNull().default("15_min"),
    ratePerUnit: doublePrecision("rate_per_unit").notNull(),
    effectiveDate: date("effective_date").notNull(),
    endDate: date("end_date"),
    /** The code the EVV aggregator knows the service by, when it differs. */
    evvCode: text("evv_code"),
    /** Let a zero-unit line go out (some payers want the encounter recorded). */
    allowZeroUnits: boolean("allow_zero_units").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("idx_billing_codes_org_code").on(t.orgId, t.code),
    index("idx_billing_codes_org_service").on(t.orgId, t.service),
    check(
      "billing_codes_service_check",
      sql`${t.service} in ('SCC', 'Job_Coaching', 'Day_Habilitation', 'Early_Intervention', 'NMT', 'Other')`
    ),
    check("billing_codes_unit_check", sql`${t.billingUnit} in ('15_min', 'hour', 'day', 'trip', 'each')`),
    check("billing_codes_rate_check", sql`${t.ratePerUnit} >= 0`),
    check("billing_codes_dates_check", sql`${t.endDate} is null or ${t.endDate} >= ${t.effectiveDate}`),
  ]
);

export const claimSubmissionsTable = pgTable(
  "claim_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** The interchange control number (ISA13 / BHT03), unique across the platform so a resend is never ambiguous. */
    controlNumber: bigserial("control_number", { mode: "number" }).notNull(),
    payerId: uuid("payer_id").references(() => payersTable.id, { onDelete: "set null" }),
    /** The adapter that built the batch, e.g. COLORADO_MEDICAID. */
    payerKey: text("payer_key").notNull(),
    format: text("format").notNull().default("837P"),
    /** ISA15 = T: a test interchange the payer will not adjudicate. */
    testMode: boolean("test_mode").notNull().default(false),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    /** The notes in the batch, by id — ids from wherever notes live (the practice dataset today). */
    noteIds: jsonb("note_ids").$type<string[]>().notNull().default([]),
    noteCount: integer("note_count").notNull().default(0),
    totalUnits: doublePrecision("total_units").notNull().default(0),
    totalCharge: doublePrecision("total_charge").notNull().default(0),
    status: text("status").$type<SubmissionStatus>().notNull().default("open"),
    /** What the payer said, or why it was voided. */
    statusNote: text("status_note"),
    fileName: text("file_name"),
    /** The wire file, attached when the batch is finalized; null while open. */
    fileContent: text("file_content"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("uq_claim_submissions_control").on(t.controlNumber),
    index("idx_claim_submissions_org_created").on(t.orgId, t.createdAt),
    check(
      "claim_submissions_status_check",
      sql`${t.status} in ('open', 'submitted', 'accepted', 'rejected', 'paid', 'denied', 'voided')`
    ),
    // A finalized batch always has its file; an open one never does.
    check("claim_submissions_file_check", sql`(${t.status} = 'open') = (${t.fileContent} is null)`),
  ]
);

export type PayerRow = typeof payersTable.$inferSelect;
export type BillingCodeRow = typeof billingCodesTable.$inferSelect;
export type ClaimSubmissionRow = typeof claimSubmissionsTable.$inferSelect;
