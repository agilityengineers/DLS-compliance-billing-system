// lib/db/src/schema/requirements.ts — the credentialing requirements registry.
//
// One row per thing a staff member must hold before they may deliver billable
// services. The registry is DATA, not code: `required` and `gating` are admin
// toggles, so a policy change is a row update rather than a deploy.
//
//   required — the item appears on every matching staff member's checklist
//   gating   — it must be verified (or waived) before the account goes Active
//
// The provenance columns matter as much as the policy ones. A compliance table
// that cannot cite its own authority cannot be audited: a developer's guess and
// counsel's sign-off look identical once they are rows. `verification_status`
// keeps them apart and the admin screen reports what is still outstanding.
//
// Shapes live in @workspace/credentialing so the engine, the API and the client
// agree on one definition.
import { pgTable, text, boolean, integer, jsonb, date, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import type { CredentialSource, Role, VerificationStatus } from "@workspace/credentialing";

export const requirementsTable = pgTable(
  "requirements",
  {
    /** Stable slug (e.g. "cpr_first_aid") — referenced by staff_credentials. */
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    /** Admin toggle: on every matching checklist. */
    required: boolean("required").notNull().default(true),
    /** Admin toggle: blocks activation, and blocks claims when lapsed. */
    gating: boolean("gating").notNull().default(true),
    /** The system can order or verify this without a human (E-Verify, LMS). */
    automated: boolean("automated").notNull().default(false),
    vendor: text("vendor"),
    appliesTo: jsonb("applies_to").$type<Role[]>().notNull(),
    /** Renewal interval in months; null = does not expire. */
    renewsMonths: integer("renews_months"),
    source: jsonb("source").$type<CredentialSource>().notNull(),
    note: text("note").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),

    // ── Provenance ──────────────────────────────────────────────────────────
    authorityCitation: text("authority_citation"),
    authorityUrl: text("authority_url"),
    verificationStatus: text("verification_status").$type<VerificationStatus>().notNull().default("unverified"),
    verifiedOn: date("verified_on"),
    verifiedBy: text("verified_by"),
    verificationNote: text("verification_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("idx_requirements_sort").on(t.sortOrder),
    check(
      "requirements_verification_status_check",
      sql`${t.verificationStatus} in ('confirmed', 'reported', 'agency_policy', 'unverified')`
    ),
    // Gating is meaningless on an item nobody has to hold. The UI and the API
    // enforce the same pairing; this is what makes it true.
    check("requirements_gating_requires_required", sql`not ${t.gating} or ${t.required}`),
    // A sign-off without a signer or a date is not a sign-off.
    check(
      "requirements_confirmed_needs_signoff",
      sql`${t.verificationStatus} <> 'confirmed' or (${t.verifiedOn} is not null and ${t.verifiedBy} is not null)`
    )
  ]
);

export const insertRequirementSchema = createInsertSchema(requirementsTable).omit({
  createdAt: true,
  updatedAt: true
});

export type InsertRequirement = z.infer<typeof insertRequirementSchema>;
export type RequirementRow = typeof requirementsTable.$inferSelect;
