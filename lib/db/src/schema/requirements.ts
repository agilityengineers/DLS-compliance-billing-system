// lib/db/src/schema/requirements.ts — the credentialing requirements registry.
//
// One row per thing a staff member must hold before they may deliver billable
// services. The registry is DATA, not code: `required` and `gating` are admin
// toggles, so a policy change is a row update rather than a deploy.
//
//   required — the item appears on every matching staff member's checklist
//   gating   — it must be verified (or waived) before the account goes Active
//
// Claim readiness, the activation gate, and the staff checklists all read from
// here. Enforcement lives in the app's credentialing engine
// (artifacts/dls-cms/src/lib/credentialing/registry.ts), which is a pure
// function over these rows.
import { pgTable, text, boolean, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Where the engine looks to decide whether a staff member holds this
 * credential. Requirements are configurable, but the PLACES credential
 * evidence can live are not — each is backed by a real column or table.
 *
 *   license  — users.license_number / users.license_expiration_date
 *   training — users.training_completed[] and Relias completions, by course name
 *   manual   — staff_credentials rows only (uploads, background checks)
 */
export type CredentialSourceKind = "license" | "training" | "manual";

export interface CredentialSource {
  kind: CredentialSourceKind;
  /** For `training`: course names that satisfy this requirement (case-insensitive). */
  courseNames?: string[];
}

/** Roles a requirement can apply to. Mirrors the app's Role union. */
export const REQUIREMENT_ROLES = ["Admin", "Scheduler", "Field_Staff"] as const;
export type RequirementRole = (typeof REQUIREMENT_ROLES)[number];

export const requirementsTable = pgTable("requirements", {
  /** Stable slug (e.g. "cpr_first_aid") — referenced by staff_credentials. */
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  /** Admin toggle: on every matching checklist. */
  required: boolean("required").notNull().default(true),
  /** Admin toggle: blocks activation and blocks claims when expired. */
  gating: boolean("gating").notNull().default(true),
  /** The system can order or verify this without a human (Checkr, E-Verify, LMS). */
  automated: boolean("automated").notNull().default(false),
  vendor: text("vendor"),
  appliesTo: jsonb("applies_to").$type<RequirementRole[]>().notNull(),
  /** Renewal interval in months; null = does not expire. */
  renewsMonths: integer("renews_months"),
  source: jsonb("source").$type<CredentialSource>().notNull(),
  note: text("note").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const insertRequirementSchema = createInsertSchema(requirementsTable).omit({
  createdAt: true,
  updatedAt: true
});

export type InsertRequirement = z.infer<typeof insertRequirementSchema>;
export type Requirement = typeof requirementsTable.$inferSelect;
