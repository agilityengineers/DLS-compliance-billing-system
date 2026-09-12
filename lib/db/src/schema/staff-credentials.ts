// lib/db/src/schema/staff-credentials.ts — one staff member's standing against
// one requirement.
//
// A row is EVIDENCE, not policy: whether the evidence is needed at all is
// decided by the requirement's `required` / `gating` toggles, which an admin
// can change without touching these rows.
//
// Absence is meaningful. No row means "not started" — the engine never treats a
// missing row as satisfied, so turning a requirement on immediately shows every
// staff member who does not yet meet it.
import { pgTable, text, uuid, date, timestamp, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { requirementsTable } from "./requirements";

/**
 * Recorded status. `expiring` and `expired` are DERIVED from `expiresOn` at
 * read time rather than stored — a stored date cannot go stale, a stored
 * status can.
 */
export const CREDENTIAL_STATUSES = ["verified", "in_progress", "not_started", "failed", "waived"] as const;
export type StoredCredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

// The engine's StaffCredentialRecord (in @workspace/credentialing) is the read
// shape of this table; keep the two in step.

export const staffCredentialsTable = pgTable(
  "staff_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirementsTable.id, { onDelete: "cascade" }),
    status: text("status").$type<StoredCredentialStatus>().notNull().default("not_started"),
    completedOn: date("completed_on"),
    /** null with status "verified" = holds indefinitely (no renewal interval). */
    expiresOn: date("expires_on"),
    note: text("note"),
    /** Admin waiver — who, why, when. A waiver satisfies a gating requirement. */
    waivedBy: uuid("waived_by"),
    waiveReason: text("waive_reason"),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    unique("uq_staff_credential").on(t.staffId, t.requirementId),
    index("idx_staff_credentials_staff").on(t.staffId),
    check(
      "staff_credentials_status_check",
      sql`${t.status} in ('verified', 'in_progress', 'not_started', 'failed', 'waived')`
    ),
    // A waiver is an accountable act: it needs a person and a reason.
    check(
      "staff_credentials_waiver_needs_reason",
      sql`${t.status} <> 'waived' or (${t.waivedBy} is not null and btrim(coalesce(${t.waiveReason}, '')) <> '')`
    )
  ]
);

export const insertStaffCredentialSchema = createInsertSchema(staffCredentialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertStaffCredential = z.infer<typeof insertStaffCredentialSchema>;
export type StaffCredentialRow = typeof staffCredentialsTable.$inferSelect;
