// lib/db/src/schema/clients.ts — the real client record.
//
// Until now the portal served client records from a synthetic in-browser
// dataset; this table is the first durable one, so that a website inquiry can
// become a person the agency serves over time. It is deliberately slim: the
// identity and contact fields a lead carries, plus the intake fields the
// existing "New client" form already asks for. The roadmap's launch tables
// (guardian, waiver, address, physician orders …) extend it with ALTERs
// rather than replacing it.
import { check, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable, usersTable } from "./access";

export const CLIENT_STATUSES = ["Active", "Inactive"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export interface ClientDiagnosis {
  code: string;
  description: string;
}

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const clientsTable = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    /** Null until intake records it; unique inside the organization once set. */
    medicaidId: text("medicaid_id"),
    dateOfBirth: date("date_of_birth"),
    activeDiagnoses: jsonb("active_diagnoses").$type<ClientDiagnosis[]>().notNull().default([]),
    insuranceProvider: text("insurance_provider"),
    servicePlanStart: date("service_plan_start"),
    servicePlanEnd: date("service_plan_end"),
    authorizedSccHoursPerWeek: doublePrecision("authorized_scc_hours_per_week").notNull().default(0),
    authorizedNmtTripsPerWeek: integer("authorized_nmt_trips_per_week").notNull().default(0),
    authorizedJcHoursPerWeek: doublePrecision("authorized_jc_hours_per_week").notNull().default(0),
    authorizedDhHoursPerWeek: doublePrecision("authorized_dh_hours_per_week").notNull().default(0),
    authorizedEiHoursPerWeek: doublePrecision("authorized_ei_hours_per_week").notNull().default(0),
    caseManagerName: text("case_manager_name"),
    ccbName: text("ccb_name"),
    residenceLat: doublePrecision("residence_lat"),
    residenceLng: doublePrecision("residence_lng"),
    /** Active | Inactive */
    status: text("status").$type<ClientStatus>().notNull().default("Active"),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("idx_clients_org_last_name").on(t.orgId, t.lastName),
    uniqueIndex("uq_clients_org_medicaid").on(t.orgId, t.medicaidId).where(sql`${t.medicaidId} is not null`),
    check("clients_status_check", sql`${t.status} in ('Active', 'Inactive')`),
  ]
);

export type ClientRow = typeof clientsTable.$inferSelect;
export type ClientInsert = typeof clientsTable.$inferInsert;

