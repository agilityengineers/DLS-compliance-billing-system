// lib/db/src/schema/clients.ts — the real client record and what hangs off it.
//
//   clients                    the person the agency serves: identity, status,
//                              demographics, contact details, address, the
//                              service plan window, diagnoses, and the health
//                              and support notes staff read before a visit
//   client_contacts            the people around the client: responsible
//                              party, guardian, emergency contact, physician,
//                              case manager
//   client_insurance_policies  primary / secondary coverage with the member
//                              and group numbers a claim needs
//   client_authorizations      prior authorizations as records of their own:
//                              number, payer, service, period, approved units
//                              and the weekly cap billing enforces
//   client_files               the paperwork on file for the client, by
//                              category, with the dates it covers, stored in
//                              the database so nothing depends on a bucket
//   client_photos              the one photo on the client's face sheet, so
//                              staff can recognise the person they serve; kept
//                              apart from the row so listing clients never
//                              drags image bytes along
//
// The four weekly `authorized_*_per_week` columns stay on the client row for
// now: claim readiness reads them, and the authorization records are the
// step towards replacing them (feature-opportunity review, recommendation 3).
import {
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable, usersTable } from "./access";
import { leadsTable } from "./leads";

export const CLIENT_STATUSES = ["Active", "Inactive", "Interim", "Discharged", "Deceased"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/** What a claim can carry (DMG03): Male, Female, or Unknown. "Other" is sent as Unknown. */
export const CLIENT_GENDERS = ["Male", "Female", "Other", "Unknown"] as const;
export type ClientGender = (typeof CLIENT_GENDERS)[number];

export const GUARDIANSHIP_STATUSES = ["Not applicable", "Guardian", "Court appointed"] as const;
export type GuardianshipStatus = (typeof GUARDIANSHIP_STATUSES)[number];

export const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Separated", "Widowed", "Other"] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const CLIENT_CONTACT_KINDS = ["responsible_party", "guardian", "emergency", "physician", "case_manager", "other"] as const;
export type ClientContactKind = (typeof CLIENT_CONTACT_KINDS)[number];

export const POLICY_TYPES = ["primary", "secondary", "tertiary"] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export const POLICY_STATUSES = ["active", "inactive"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

/** The services DLS bills, plus transportation (counted in trips) and a catch-all. */
export const AUTHORIZATION_SERVICES = ["SCC", "Job_Coaching", "Day_Habilitation", "Early_Intervention", "NMT", "Other"] as const;
export type AuthorizationService = (typeof AUTHORIZATION_SERVICES)[number];

/** What one approved unit is: a 15-minute unit, an hour, a trip, or a dollar. */
export const AUTHORIZATION_UNIT_BASES = ["unit", "hour", "trip", "dollar"] as const;
export type AuthorizationUnitBasis = (typeof AUTHORIZATION_UNIT_BASES)[number];

/** Expired and exhausted are derived from the dates and the usage, never stored. */
export const AUTHORIZATION_STATUSES = ["active", "pending", "void"] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const CLIENT_FILE_CATEGORIES = [
  "Acknowledgement form",
  "Birth certificate",
  "Consent",
  "CSR / individualized plan",
  "DVR information",
  "Guardianship papers",
  "Insurance card",
  "Medicaid card",
  "Photo ID",
  "Physician order",
  "Service plan",
  "Other",
] as const;
export type ClientFileCategory = (typeof CLIENT_FILE_CATEGORIES)[number];

/** The largest file the paperwork folder accepts. */
export const CLIENT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** What the paperwork folder accepts: documents and photographs of documents. */
export const CLIENT_FILE_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
] as const;

/** The largest photo the face sheet accepts. */
export const CLIENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * What the face sheet shows: formats every browser renders. No SVG (it can
 * carry script) and no HEIC (most browsers cannot show it).
 */
export const CLIENT_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ClientPhotoContentType = (typeof CLIENT_PHOTO_CONTENT_TYPES)[number];

export interface ClientDiagnosis {
  code: string;
  description: string;
  /** The principal diagnosis on a claim. At most one; the first code when none is marked. */
  isPrimary?: boolean;
}

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

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
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    email: text("email"),
    /** Home / primary number; cell and work are separate. */
    phone: text("phone"),
    phoneCell: text("phone_cell"),
    phoneWork: text("phone_work"),
    /** Null until intake records it; unique inside the organization once set. */
    medicaidId: text("medicaid_id"),
    dateOfBirth: date("date_of_birth"),
    gender: text("gender").$type<ClientGender>(),
    genderIdentity: text("gender_identity"),
    maritalStatus: text("marital_status").$type<MaritalStatus>(),
    ethnicity: text("ethnicity"),
    race: text("race"),
    guardianshipStatus: text("guardianship_status").$type<GuardianshipStatus>(),
    /** The agency's own reference for the client, if it keeps one. */
    accountCode: text("account_code"),
    admissionDate: date("admission_date"),
    dischargeDate: date("discharge_date"),
    address1: text("address1"),
    address2: text("address2"),
    city: text("city"),
    state: text("state"),
    county: text("county"),
    zip: text("zip"),
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
    // ── health and support, read before a visit ──────────────────────────
    allergies: text("allergies"),
    medicalConcerns: text("medical_concerns"),
    supervisionRequirements: text("supervision_requirements"),
    generalInformation: text("general_information"),
    hasBehaviorSupportPlan: boolean("has_behavior_support_plan").notNull().default(false),
    behaviorSupportPlanNotes: text("behavior_support_plan_notes"),
    /** Active | Inactive | Interim | Discharged | Deceased */
    status: text("status").$type<ClientStatus>().notNull().default("Active"),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    /**
     * The inquiry this client was created from, when there was one. Unique:
     * two conversions of the same inquiry cannot both produce a client, even
     * if they run at the same instant (leads.converted_client_id is the other
     * half of the link). The lazy, typed reference breaks the import cycle
     * with the leads schema.
     */
    sourceLeadId: uuid("source_lead_id").references((): AnyPgColumn => leadsTable.id, { onDelete: "set null" }),
    /**
     * Set when this row is a PRACTICE record: a copy of one of the app's
     * synthetic demo clients, made so it can be opened and tested like a real
     * one. It holds that demo client's id, so the demo data hanging off it
     * (visits, notes) still finds it. Null for every real person. Unique
     * inside the organization, so a practice client is copied at most once.
     */
    sampleKey: text("sample_key"),
    /**
     * When the face-sheet photo was last set; null when there is none. The
     * bytes live in client_photos; this stamp tells a reader there is one
     * and doubles as the cache-buster for its URL.
     */
    photoUpdatedAt: timestamp("photo_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("idx_clients_org_last_name").on(t.orgId, t.lastName),
    uniqueIndex("uq_clients_org_sample_key").on(t.orgId, t.sampleKey).where(sql`${t.sampleKey} is not null`),
    uniqueIndex("uq_clients_org_medicaid").on(t.orgId, t.medicaidId).where(sql`${t.medicaidId} is not null`),
    uniqueIndex("uq_clients_source_lead").on(t.sourceLeadId).where(sql`${t.sourceLeadId} is not null`),
    check("clients_status_check", sql`${t.status} in ('Active', 'Inactive', 'Interim', 'Discharged', 'Deceased')`),
    check("clients_gender_check", sql`${t.gender} is null or ${t.gender} in ('Male', 'Female', 'Other', 'Unknown')`),
    check(
      "clients_guardianship_check",
      sql`${t.guardianshipStatus} is null or ${t.guardianshipStatus} in ('Not applicable', 'Guardian', 'Court appointed')`
    ),
    check(
      "clients_marital_check",
      sql`${t.maritalStatus} is null or ${t.maritalStatus} in ('Single', 'Married', 'Divorced', 'Separated', 'Widowed', 'Other')`
    ),
  ]
);

export const clientContactsTable = pgTable(
  "client_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ClientContactKind>().notNull(),
    name: text("name").notNull(),
    relationship: text("relationship"),
    phone: text("phone"),
    email: text("email"),
    address1: text("address1"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    /** A physician's NPI, for the referring-provider loop on a claim. */
    npi: text("npi"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("idx_client_contacts_client").on(t.clientId),
    check(
      "client_contacts_kind_check",
      sql`${t.kind} in ('responsible_party', 'guardian', 'emergency', 'physician', 'case_manager', 'other')`
    ),
  ]
);

export const clientInsurancePoliciesTable = pgTable(
  "client_insurance_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    policyType: text("policy_type").$type<PolicyType>().notNull().default("primary"),
    payerName: text("payer_name").notNull(),
    memberId: text("member_id"),
    groupNumber: text("group_number"),
    status: text("status").$type<PolicyStatus>().notNull().default("active"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    policyHolderName: text("policy_holder_name"),
    policyHolderRelationship: text("policy_holder_relationship"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("idx_client_insurance_policies_client").on(t.clientId),
    check("client_insurance_policies_type_check", sql`${t.policyType} in ('primary', 'secondary', 'tertiary')`),
    check("client_insurance_policies_status_check", sql`${t.status} in ('active', 'inactive')`),
    check("client_insurance_policies_dates_check", sql`${t.endDate} is null or ${t.startDate} is null or ${t.endDate} >= ${t.startDate}`),
  ]
);

export const clientAuthorizationsTable = pgTable(
  "client_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    /** The payer's number, e.g. PA-2026-44817. */
    authNumber: text("auth_number"),
    payerName: text("payer_name"),
    service: text("service").$type<AuthorizationService>().notNull(),
    /** The procedure code the authorization is written against, e.g. T2021. */
    billingCode: text("billing_code"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    approvedUnits: doublePrecision("approved_units").notNull(),
    unitBasis: text("unit_basis").$type<AuthorizationUnitBasis>().notNull().default("unit"),
    /** The most that may be delivered in one Sunday–Saturday week, in the same basis; null when the period total is the only cap. */
    weeklyCapUnits: doublePrecision("weekly_cap_units"),
    ratePerUnit: doublePrecision("rate_per_unit"),
    status: text("status").$type<AuthorizationStatus>().notNull().default("active"),
    /** Let billing continue past the approved total (the payer has agreed informally, or a renewal is in flight). */
    permitOverBudget: boolean("permit_over_budget").notNull().default(false),
    /** Keep services under this authorization out of claim submissions (private pay, pending appeal). */
    excludeFromSubmission: boolean("exclude_from_submission").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("idx_client_authorizations_client").on(t.clientId),
    index("idx_client_authorizations_org_end").on(t.orgId, t.endDate),
    check(
      "client_authorizations_service_check",
      sql`${t.service} in ('SCC', 'Job_Coaching', 'Day_Habilitation', 'Early_Intervention', 'NMT', 'Other')`
    ),
    check("client_authorizations_basis_check", sql`${t.unitBasis} in ('unit', 'hour', 'trip', 'dollar')`),
    check("client_authorizations_status_check", sql`${t.status} in ('active', 'pending', 'void')`),
    check("client_authorizations_dates_check", sql`${t.endDate} >= ${t.startDate}`),
    check("client_authorizations_units_check", sql`${t.approvedUnits} >= 0 and (${t.weeklyCapUnits} is null or ${t.weeklyCapUnits} >= 0)`),
  ]
);

export const clientFilesTable = pgTable(
  "client_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    content: bytea("content").notNull(),
    /** The period the document covers; a passed end date is what makes it due for renewal. */
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("idx_client_files_client").on(t.clientId),
    check("client_files_size_check", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= ${sql.raw(String(CLIENT_FILE_MAX_BYTES))}`),
    check("client_files_dates_check", sql`${t.endDate} is null or ${t.startDate} is null or ${t.endDate} >= ${t.startDate}`),
  ]
);

export const clientPhotosTable = pgTable(
  "client_photos",
  {
    /** One photo per client: replacing it overwrites this row. */
    clientId: uuid("client_id")
      .primaryKey()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    contentType: text("content_type").$type<ClientPhotoContentType>().notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    content: bytea("content").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("idx_client_photos_org").on(t.orgId),
    check("client_photos_size_check", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= ${sql.raw(String(CLIENT_PHOTO_MAX_BYTES))}`),
    check("client_photos_type_check", sql`${t.contentType} in ('image/jpeg', 'image/png', 'image/webp')`),
  ]
);

export type ClientRow = typeof clientsTable.$inferSelect;
export type ClientInsert = typeof clientsTable.$inferInsert;
export type ClientContactRow = typeof clientContactsTable.$inferSelect;
export type ClientInsurancePolicyRow = typeof clientInsurancePoliciesTable.$inferSelect;
export type ClientAuthorizationRow = typeof clientAuthorizationsTable.$inferSelect;
export type ClientFileRow = typeof clientFilesTable.$inferSelect;
export type ClientPhotoRow = typeof clientPhotosTable.$inferSelect;
