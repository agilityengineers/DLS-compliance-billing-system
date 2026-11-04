// Client records — the durable client data in the portal.
//
// The record itself (demographics, contact details, address, status, the
// service plan window, diagnoses, health and support notes) rides the
// `clients.core` switch. What hangs off it is switchable on its own, so the
// provider can make each part available per organization and the Admin can
// decide which roles get it:
//
//   clients.contacts        /clients/:id/contacts        the people around the client
//   clients.insurance       /clients/:id/policies        primary / secondary coverage
//   clients.authorizations  /clients/:id/authorizations  prior authorizations as records
//   clients.paperwork       /clients/:id/files           documents on file, stored here
//
// Creating a client from a lead is the conversion: the client row, the lead's
// move to the funnel's "won" stage and the timeline entry land in one
// transaction, so a lead can never be half-converted. The lead row is locked
// for that transaction and the move is conditional on the lead still being
// unconverted, so two conversions of one inquiry started at the same instant
// produce one client and one 409 — never two clients — and a stage change
// racing the conversion either lands before it or is refused after it. A
// unique index on clients.source_lead_id says the same thing at the database,
// and the 409 names the client the inquiry became, so a retried request can
// find it.
//
// Audit entries name what changed (field names, ids, categories), never what
// it changed to: the log is for accountability, not a second copy of the chart.
import { Router, raw, type IRouter } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  AUTHORIZATION_SERVICES,
  AUTHORIZATION_STATUSES,
  AUTHORIZATION_UNIT_BASES,
  CLIENT_CONTACT_KINDS,
  CLIENT_FILE_CATEGORIES,
  CLIENT_FILE_CONTENT_TYPES,
  CLIENT_FILE_MAX_BYTES,
  CLIENT_GENDERS,
  CLIENT_STATUSES,
  GUARDIANSHIP_STATUSES,
  MARITAL_STATUSES,
  POLICY_STATUSES,
  POLICY_TYPES,
  clientAuthorizationsTable,
  clientContactsTable,
  clientFilesTable,
  clientInsurancePoliciesTable,
  clientsTable,
  leadActivitiesTable,
  leadsTable,
  type ClientAuthorizationRow,
  type ClientContactRow,
  type ClientFileRow,
  type ClientInsurancePolicyRow,
  type ClientRow,
  type Db,
  type DbOrTx,
  type LeadRow,
  type LeadStageRow,
} from "@workspace/db";
import { recordAudit, type AuditEntry } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { findStage, lockLead, stageOfKind } from "../lib/leads";
import type { Mailer } from "../lib/mail";
import { requireAuth, requireAuthContext, requireFeature, requireOrgId, roleOf, type AuthContext } from "../middlewares/auth";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalDate = z.union([z.literal(""), isoDate]).optional();
const optionalChoice = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.literal(""), z.enum(values)]).optional();

const Diagnosis = z.object({
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(200),
  isPrimary: z.boolean().optional(),
});

/** Everything on the record that intake or a later edit may set. */
const ClientFields = z.object({
  middleName: optionalText(120),
  email: z.union([z.literal(""), z.email().max(254)]).optional(),
  phone: optionalText(40),
  phoneCell: optionalText(40),
  phoneWork: optionalText(40),
  medicaidId: optionalText(40),
  dateOfBirth: optionalDate,
  gender: optionalChoice(CLIENT_GENDERS),
  genderIdentity: optionalText(80),
  maritalStatus: optionalChoice(MARITAL_STATUSES),
  ethnicity: optionalText(80),
  race: optionalText(80),
  guardianshipStatus: optionalChoice(GUARDIANSHIP_STATUSES),
  accountCode: optionalText(40),
  admissionDate: optionalDate,
  dischargeDate: optionalDate,
  address1: optionalText(200),
  address2: optionalText(200),
  city: optionalText(120),
  state: optionalText(2),
  county: optionalText(120),
  zip: optionalText(10),
  activeDiagnoses: z.array(Diagnosis).max(50).optional(),
  insuranceProvider: optionalText(120),
  servicePlanStart: optionalDate,
  servicePlanEnd: optionalDate,
  authorizedSccHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  authorizedNmtTripsPerWeek: z.coerce.number().int().min(0).max(100).optional(),
  authorizedJcHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  authorizedDhHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  authorizedEiHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  caseManagerName: optionalText(120),
  ccbName: optionalText(120),
  residenceLat: z.coerce.number().min(-90).max(90).nullable().optional(),
  residenceLng: z.coerce.number().min(-180).max(180).nullable().optional(),
  allergies: optionalText(2000),
  medicalConcerns: optionalText(4000),
  supervisionRequirements: optionalText(4000),
  generalInformation: optionalText(4000),
  hasBehaviorSupportPlan: z.boolean().optional(),
  behaviorSupportPlanNotes: optionalText(4000),
});

const ClientBody = ClientFields.extend({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  /** The inquiry this client came from; converting it is part of the same write. */
  sourceLeadId: z.uuid().optional(),
  /**
   * Marks the new row as a PRACTICE record copied from one of the app's
   * synthetic demo clients (the value is that demo client's id). Creating the
   * same practice client twice returns the copy that already exists.
   */
  sampleKey: z.string().trim().min(1).max(64).optional(),
});

const ClientPatch = ClientFields.extend({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
});

const ContactBody = z.object({
  kind: z.enum(CLIENT_CONTACT_KINDS),
  name: z.string().trim().min(1).max(160),
  relationship: optionalText(80),
  phone: optionalText(40),
  email: z.union([z.literal(""), z.email().max(254)]).optional(),
  address1: optionalText(200),
  city: optionalText(120),
  state: optionalText(2),
  zip: optionalText(10),
  npi: z.union([z.literal(""), z.string().regex(/^\d{10}$/, "An NPI is 10 digits.")]).optional(),
  isPrimary: z.boolean().optional(),
  notes: optionalText(2000),
});
const ContactPatch = ContactBody.partial();

const PolicyBody = z.object({
  policyType: z.enum(POLICY_TYPES).optional(),
  payerName: z.string().trim().min(1).max(160),
  memberId: optionalText(60),
  groupNumber: optionalText(60),
  status: z.enum(POLICY_STATUSES).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  policyHolderName: optionalText(160),
  policyHolderRelationship: optionalText(80),
  notes: optionalText(2000),
});
const PolicyPatch = PolicyBody.partial();

const AuthorizationBody = z.object({
  authNumber: optionalText(60),
  payerName: optionalText(160),
  service: z.enum(AUTHORIZATION_SERVICES),
  billingCode: optionalText(20),
  startDate: isoDate,
  endDate: isoDate,
  approvedUnits: z.coerce.number().min(0).max(1_000_000),
  unitBasis: z.enum(AUTHORIZATION_UNIT_BASES).optional(),
  weeklyCapUnits: z.coerce.number().min(0).max(100_000).nullable().optional(),
  ratePerUnit: z.coerce.number().min(0).max(100_000).nullable().optional(),
  status: z.enum(AUTHORIZATION_STATUSES).optional(),
  permitOverBudget: z.boolean().optional(),
  excludeFromSubmission: z.boolean().optional(),
  notes: optionalText(2000),
});
const AuthorizationPatch = AuthorizationBody.partial();

const FileMeta = z.object({
  fileName: z.string().trim().min(1).max(200),
  category: z.enum(CLIENT_FILE_CATEGORIES),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalText(2000),
});
const FilePatch = FileMeta.partial().omit({ fileName: true }).extend({ fileName: z.string().trim().min(1).max(200).optional() });

export interface ClientJson {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  phoneCell: string | null;
  phoneWork: string | null;
  medicaidId: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  genderIdentity: string | null;
  maritalStatus: string | null;
  ethnicity: string | null;
  race: string | null;
  guardianshipStatus: string | null;
  accountCode: string | null;
  admissionDate: string | null;
  dischargeDate: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  zip: string | null;
  activeDiagnoses: { code: string; description: string; isPrimary?: boolean }[];
  insuranceProvider: string | null;
  servicePlanStart: string | null;
  servicePlanEnd: string | null;
  authorizedSccHoursPerWeek: number;
  authorizedNmtTripsPerWeek: number;
  authorizedJcHoursPerWeek: number;
  authorizedDhHoursPerWeek: number;
  authorizedEiHoursPerWeek: number;
  caseManagerName: string | null;
  ccbName: string | null;
  residenceLat: number | null;
  residenceLng: number | null;
  allergies: string | null;
  medicalConcerns: string | null;
  supervisionRequirements: string | null;
  generalInformation: string | null;
  hasBehaviorSupportPlan: boolean;
  behaviorSupportPlanNotes: string | null;
  status: ClientRow["status"];
  /** The inquiry this client was created from, when there was one. */
  sourceLeadId: string | null;
  /** Set on a practice record (a copy of a synthetic demo client); null for a real person. */
  sampleKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toClientJson(c: ClientRow): ClientJson {
  return {
    id: c.id,
    firstName: c.firstName,
    middleName: c.middleName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    phoneCell: c.phoneCell,
    phoneWork: c.phoneWork,
    medicaidId: c.medicaidId,
    dateOfBirth: c.dateOfBirth,
    gender: c.gender,
    genderIdentity: c.genderIdentity,
    maritalStatus: c.maritalStatus,
    ethnicity: c.ethnicity,
    race: c.race,
    guardianshipStatus: c.guardianshipStatus,
    accountCode: c.accountCode,
    admissionDate: c.admissionDate,
    dischargeDate: c.dischargeDate,
    address1: c.address1,
    address2: c.address2,
    city: c.city,
    state: c.state,
    county: c.county,
    zip: c.zip,
    activeDiagnoses: c.activeDiagnoses,
    insuranceProvider: c.insuranceProvider,
    servicePlanStart: c.servicePlanStart,
    servicePlanEnd: c.servicePlanEnd,
    authorizedSccHoursPerWeek: c.authorizedSccHoursPerWeek,
    authorizedNmtTripsPerWeek: c.authorizedNmtTripsPerWeek,
    authorizedJcHoursPerWeek: c.authorizedJcHoursPerWeek,
    authorizedDhHoursPerWeek: c.authorizedDhHoursPerWeek,
    authorizedEiHoursPerWeek: c.authorizedEiHoursPerWeek,
    caseManagerName: c.caseManagerName,
    ccbName: c.ccbName,
    residenceLat: c.residenceLat,
    residenceLng: c.residenceLng,
    allergies: c.allergies,
    medicalConcerns: c.medicalConcerns,
    supervisionRequirements: c.supervisionRequirements,
    generalInformation: c.generalInformation,
    hasBehaviorSupportPlan: c.hasBehaviorSupportPlan,
    behaviorSupportPlanNotes: c.behaviorSupportPlanNotes,
    status: c.status,
    sourceLeadId: c.sourceLeadId,
    sampleKey: c.sampleKey,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toContactJson(r: ClientContactRow) {
  return {
    id: r.id,
    clientId: r.clientId,
    kind: r.kind,
    name: r.name,
    relationship: r.relationship,
    phone: r.phone,
    email: r.email,
    address1: r.address1,
    city: r.city,
    state: r.state,
    zip: r.zip,
    npi: r.npi,
    isPrimary: r.isPrimary,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toPolicyJson(r: ClientInsurancePolicyRow) {
  return {
    id: r.id,
    clientId: r.clientId,
    policyType: r.policyType,
    payerName: r.payerName,
    memberId: r.memberId,
    groupNumber: r.groupNumber,
    status: r.status,
    startDate: r.startDate,
    endDate: r.endDate,
    policyHolderName: r.policyHolderName,
    policyHolderRelationship: r.policyHolderRelationship,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toAuthorizationJson(r: ClientAuthorizationRow) {
  return {
    id: r.id,
    clientId: r.clientId,
    authNumber: r.authNumber,
    payerName: r.payerName,
    service: r.service,
    billingCode: r.billingCode,
    startDate: r.startDate,
    endDate: r.endDate,
    approvedUnits: r.approvedUnits,
    unitBasis: r.unitBasis,
    weeklyCapUnits: r.weeklyCapUnits,
    ratePerUnit: r.ratePerUnit,
    status: r.status,
    permitOverBudget: r.permitOverBudget,
    excludeFromSubmission: r.excludeFromSubmission,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** The file's record without its bytes; those come from /content. */
export function toFileJson(r: Omit<ClientFileRow, "content">) {
  return {
    id: r.id,
    clientId: r.clientId,
    category: r.category,
    fileName: r.fileName,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    startDate: r.startDate,
    endDate: r.endDate,
    notes: r.notes,
    uploadedByUserId: r.uploadedByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const blankToNull = (v: string | undefined): string | null => (v === undefined || v === "" ? null : v);
/** For a PATCH: undefined leaves the column alone, "" clears it. */
const patchText = (v: string | undefined): string | null | undefined => (v === undefined ? undefined : v === "" ? null : v);

/** At most one principal diagnosis; the first code is principal when none is marked. */
function normalizeDiagnoses(list: z.infer<typeof Diagnosis>[]): z.infer<typeof Diagnosis>[] {
  const primaryIndex = list.findIndex((d) => d.isPrimary);
  return list.map((d, i) => ({ code: d.code, description: d.description, isPrimary: i === (primaryIndex === -1 ? 0 : primaryIndex) }));
}

/** The column values a create or an edit sets, from the validated body. */
function fieldValues(body: z.infer<typeof ClientFields>, mode: "create" | "patch") {
  const text = mode === "create" ? blankToNull : patchText;
  return {
    middleName: text(body.middleName),
    email: body.email === undefined ? (mode === "create" ? null : undefined) : body.email === "" ? null : body.email.toLowerCase(),
    phone: text(body.phone),
    phoneCell: text(body.phoneCell),
    phoneWork: text(body.phoneWork),
    medicaidId: text(body.medicaidId),
    dateOfBirth: text(body.dateOfBirth),
    gender: text(body.gender) as ClientRow["gender"] | undefined,
    genderIdentity: text(body.genderIdentity),
    maritalStatus: text(body.maritalStatus) as ClientRow["maritalStatus"] | undefined,
    ethnicity: text(body.ethnicity),
    race: text(body.race),
    guardianshipStatus: text(body.guardianshipStatus) as ClientRow["guardianshipStatus"] | undefined,
    accountCode: text(body.accountCode),
    admissionDate: text(body.admissionDate),
    dischargeDate: text(body.dischargeDate),
    address1: text(body.address1),
    address2: text(body.address2),
    city: text(body.city),
    state: body.state === undefined ? (mode === "create" ? null : undefined) : body.state === "" ? null : body.state.toUpperCase(),
    county: text(body.county),
    zip: text(body.zip),
    activeDiagnoses: body.activeDiagnoses === undefined ? (mode === "create" ? [] : undefined) : normalizeDiagnoses(body.activeDiagnoses),
    insuranceProvider: text(body.insuranceProvider),
    servicePlanStart: text(body.servicePlanStart),
    servicePlanEnd: text(body.servicePlanEnd),
    authorizedSccHoursPerWeek: body.authorizedSccHoursPerWeek ?? (mode === "create" ? 0 : undefined),
    authorizedNmtTripsPerWeek: body.authorizedNmtTripsPerWeek ?? (mode === "create" ? 0 : undefined),
    authorizedJcHoursPerWeek: body.authorizedJcHoursPerWeek ?? (mode === "create" ? 0 : undefined),
    authorizedDhHoursPerWeek: body.authorizedDhHoursPerWeek ?? (mode === "create" ? 0 : undefined),
    authorizedEiHoursPerWeek: body.authorizedEiHoursPerWeek ?? (mode === "create" ? 0 : undefined),
    caseManagerName: text(body.caseManagerName),
    ccbName: text(body.ccbName),
    residenceLat: body.residenceLat === undefined ? (mode === "create" ? null : undefined) : body.residenceLat,
    residenceLng: body.residenceLng === undefined ? (mode === "create" ? null : undefined) : body.residenceLng,
    allergies: text(body.allergies),
    medicalConcerns: text(body.medicalConcerns),
    supervisionRequirements: text(body.supervisionRequirements),
    generalInformation: text(body.generalInformation),
    hasBehaviorSupportPlan: body.hasBehaviorSupportPlan ?? (mode === "create" ? false : undefined),
    behaviorSupportPlanNotes: text(body.behaviorSupportPlanNotes),
  };
}

/** Drop the keys a PATCH did not mention so the update touches only what was sent. */
function definedOnly<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * The index or constraint a Postgres 23505 names, whether the driver threw it
 * directly or the ORM wrapped it as `cause`; null when the error is something
 * else. An empty string means a unique violation that named nothing.
 */
function uniqueViolationOf(e: unknown, depth = 0): string | null {
  if (typeof e !== "object" || e === null || depth > 3) return null;
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === "23505") return constraint ?? "";
  return uniqueViolationOf((e as { cause?: unknown }).cause, depth + 1);
}

/** A check constraint the database refused (23514), by name; null otherwise. */
function checkViolationOf(e: unknown, depth = 0): string | null {
  if (typeof e !== "object" || e === null || depth > 3) return null;
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === "23514") return constraint ?? "";
  return checkViolationOf((e as { cause?: unknown }).cause, depth + 1);
}

/**
 * The 409 names the client when it is known, so a request retried after its
 * first copy succeeded — a double click, a resent request after a dropped
 * reply — can find what that copy made instead of being left with nothing.
 */
const alreadyConverted = (clientId: string | null = null) =>
  conflict("LEAD_ALREADY_CONVERTED", "That inquiry has already become a client.", clientId ? { clientId } : undefined);

/** Turn a dates check refusal into the message a person can act on. */
function datesRefused(e: unknown): never {
  const violated = checkViolationOf(e);
  if (violated && violated.endsWith("_dates_check")) throw badRequest("The end date must not be before the start date.");
  throw e;
}

/** A client in the caller's organization, or 404. */
async function loadClient(db: DbOrTx, orgId: string, id: string): Promise<ClientRow> {
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.orgId, orgId), eq(clientsTable.id, id)))
    .limit(1);
  if (!row) throw notFound("Client not found.");
  return row;
}

/** A safe file name for a Content-Disposition header: ASCII, no quotes or path. */
function dispositionName(name: string): string {
  const cleaned = name.replace(/[\\/]/g, "_").replace(/["\r\n]/g, "").replace(/[^\x20-\x7e]/g, "_").trim();
  return cleaned || "document";
}

export function clientsRouter(db: Db, _config: AppConfig, _deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();
  router.use("/clients", requireAuth, requireFeature("clients.core"));

  const contactsOn = requireFeature("clients.contacts");
  const insuranceOn = requireFeature("clients.insurance");
  const authorizationsOn = requireFeature("clients.authorizations");
  const paperworkOn = requireFeature("clients.paperwork");

  function actorFor(req: { ip?: string }, auth: AuthContext, orgId: string): Omit<AuditEntry, "action" | "targetType"> {
    return {
      orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      ip: req.ip ?? null,
    };
  }

  // ── the record ───────────────────────────────────────────────────────
  router.get("/clients", async (req, res) => {
    const orgId = requireOrgId(res);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await db
      .select()
      .from(clientsTable)
      .where(
        status && (CLIENT_STATUSES as readonly string[]).includes(status)
          ? and(eq(clientsTable.orgId, orgId), eq(clientsTable.status, status as ClientRow["status"]))
          : eq(clientsTable.orgId, orgId)
      )
      .orderBy(asc(clientsTable.lastName), asc(clientsTable.firstName));
    res.json({ clients: rows.map(toClientJson) });
  });

  router.get("/clients/:id", async (req, res) => {
    const orgId = requireOrgId(res);
    const row = await loadClient(db, orgId, String(req.params.id));
    res.json({ client: toClientJson(row) });
  });

  router.post("/clients", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = ClientBody.parse(req.body);
    if (body.sampleKey && body.sourceLeadId) throw badRequest("A practice record cannot come from an inquiry.");

    // A practice client is copied at most once per organization: asking again
    // (a second tab, a double click) hands back the copy that already exists.
    const existingSample = async (): Promise<ClientRow | undefined> =>
      body.sampleKey
        ? (await db
            .select()
            .from(clientsTable)
            .where(and(eq(clientsTable.orgId, orgId), eq(clientsTable.sampleKey, body.sampleKey)))
            .limit(1))[0]
        : undefined;
    const already = await existingSample();
    if (already) {
      res.json({ client: toClientJson(already), convertedLeadId: null });
      return;
    }

    interface Conversion {
      client: ClientRow;
      lead: LeadRow | null;
      fromStage: LeadStageRow | undefined;
      wonStage: LeadStageRow | undefined;
    }
    let outcome: Conversion;
    try {
      outcome = await db.transaction(async (tx): Promise<Conversion> => {
        // Converting a lead needs the lead, in this organization, not yet
        // converted, and a "won" stage to move it to. The lead is read under
        // a row lock, so what is checked here is what is still true when the
        // writes below land; a second conversion waits on the lock and then
        // sees this one's result.
        let lead: LeadRow | null = null;
        let fromStage: LeadStageRow | undefined;
        let wonStage: LeadStageRow | undefined;
        if (body.sourceLeadId) {
          lead = (await lockLead(tx, orgId, body.sourceLeadId)) ?? null;
          if (!lead) throw notFound("Inquiry not found.");
          fromStage = await findStage(tx, orgId, lead.stageId);
          if (lead.convertedClientId || fromStage?.kind === "won") throw alreadyConverted(lead.convertedClientId);
          wonStage = await stageOfKind(tx, orgId, "won");
          if (!wonStage) throw badRequest("The funnel has no 'converted' stage to move the inquiry to.");
        }

        const values = fieldValues(body, "create");
        const [created] = await tx
          .insert(clientsTable)
          .values({
            orgId,
            firstName: body.firstName,
            lastName: body.lastName,
            ...values,
            activeDiagnoses: values.activeDiagnoses ?? [],
            createdByUserId: auth.realUser.id,
            sourceLeadId: lead?.id ?? null,
            sampleKey: body.sampleKey ?? null,
          })
          .returning();
        if (lead && wonStage) {
          const now = new Date();
          // "Still unconverted" is part of the write itself. With the lock
          // above this cannot fail; without it, it would still refuse to
          // overwrite another conversion — and roll the client back with it.
          const [moved] = await tx
            .update(leadsTable)
            .set({ stageId: wonStage.id, convertedClientId: created!.id, closedReason: null, lastActivityAt: now, updatedAt: now })
            .where(and(eq(leadsTable.id, lead.id), isNull(leadsTable.convertedClientId)))
            .returning({ id: leadsTable.id });
          if (!moved) throw alreadyConverted();
          await tx.insert(leadActivitiesTable).values({
            leadId: lead.id,
            type: "converted",
            details: { clientId: created!.id, from: lead.stageId, to: wonStage.id },
            actorUserId: auth.realUser.id,
          });
        }
        return { client: created!, lead, fromStage, wonStage };
      });
    } catch (e) {
      const violated = uniqueViolationOf(e);
      if (violated === "uq_clients_org_sample_key") {
        const raced = await existingSample();
        if (raced) {
          res.json({ client: toClientJson(raced), convertedLeadId: null });
          return;
        }
      }
      if (violated === "uq_clients_source_lead" || violated === "uq_leads_converted_client") throw alreadyConverted();
      if (violated !== null) throw conflict("MEDICAID_ID_TAKEN", "A client with that Medicaid ID already exists.");
      throw e;
    }
    const { client, lead, fromStage, wonStage } = outcome;

    const actor = actorFor(req, auth, orgId);
    await recordAudit(db, {
      ...actor,
      action: "client.created",
      targetType: "client",
      targetId: client.id,
      details: { sourceLeadId: lead?.id ?? null, ...(client.sampleKey ? { practiceRecord: true } : {}) },
    });
    if (lead && wonStage) {
      await recordAudit(db, {
        ...actor,
        action: "lead.converted",
        targetType: "lead",
        targetId: lead.id,
        details: { clientId: client.id, from: fromStage?.key ?? null, to: wonStage.key },
      });
    }
    res.status(201).json({ client: toClientJson(client), convertedLeadId: lead?.id ?? null });
  });

  router.patch("/clients/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const current = await loadClient(db, orgId, String(req.params.id));
    const body = ClientPatch.parse(req.body);
    const { status, firstName, lastName, ...fields } = body;
    const values = definedOnly({ firstName, lastName, ...fieldValues(fields, "patch") });
    const statusChange = status !== undefined && status !== current.status ? { from: current.status, to: status } : null;
    // Taking someone off the roster — or marking them deceased — is the
    // Admin's call; office staff edit the chart but do not change its status.
    if (statusChange && roleOf(auth.effectiveUser) !== "Admin") throw forbidden("Only an Admin can change a client's status.");
    if (Object.keys(values).length === 0 && !statusChange) {
      res.json({ client: toClientJson(current) });
      return;
    }
    let updated: ClientRow;
    try {
      [updated] = (await db
        .update(clientsTable)
        .set({ ...values, ...(statusChange ? { status: statusChange.to } : {}), updatedAt: new Date() })
        .where(and(eq(clientsTable.orgId, orgId), eq(clientsTable.id, current.id)))
        .returning()) as [ClientRow];
    } catch (e) {
      if (uniqueViolationOf(e) !== null) throw conflict("MEDICAID_ID_TAKEN", "A client with that Medicaid ID already exists.");
      throw e;
    }
    const actor = actorFor(req, auth, orgId);
    if (Object.keys(values).length > 0) {
      await recordAudit(db, { ...actor, action: "client.updated", targetType: "client", targetId: current.id, details: { fields: Object.keys(values) } });
    }
    if (statusChange) {
      await recordAudit(db, { ...actor, action: "client.status_changed", targetType: "client", targetId: current.id, details: statusChange });
    }
    res.json({ client: toClientJson(updated) });
  });

  // ── contacts ─────────────────────────────────────────────────────────
  router.get("/clients/:id/contacts", contactsOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const rows = await db
      .select()
      .from(clientContactsTable)
      .where(eq(clientContactsTable.clientId, client.id))
      .orderBy(desc(clientContactsTable.isPrimary), asc(clientContactsTable.name));
    res.json({ contacts: rows.map(toContactJson) });
  });

  router.post("/clients/:id/contacts", contactsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const body = ContactBody.parse(req.body);
    const [row] = await db
      .insert(clientContactsTable)
      .values({
        orgId,
        clientId: client.id,
        kind: body.kind,
        name: body.name,
        relationship: blankToNull(body.relationship),
        phone: blankToNull(body.phone),
        email: blankToNull(body.email)?.toLowerCase() ?? null,
        address1: blankToNull(body.address1),
        city: blankToNull(body.city),
        state: blankToNull(body.state)?.toUpperCase() ?? null,
        zip: blankToNull(body.zip),
        npi: blankToNull(body.npi),
        isPrimary: body.isPrimary ?? false,
        notes: blankToNull(body.notes),
      })
      .returning();
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.contact_added", targetType: "client", targetId: client.id, details: { contactId: row!.id, kind: body.kind } });
    res.status(201).json({ contact: toContactJson(row!) });
  });

  router.patch("/clients/:id/contacts/:contactId", contactsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const body = ContactPatch.parse(req.body);
    const values = definedOnly({
      kind: body.kind,
      name: body.name,
      relationship: patchText(body.relationship),
      phone: patchText(body.phone),
      email: body.email === undefined ? undefined : body.email === "" ? null : body.email.toLowerCase(),
      address1: patchText(body.address1),
      city: patchText(body.city),
      state: body.state === undefined ? undefined : body.state === "" ? null : body.state.toUpperCase(),
      zip: patchText(body.zip),
      npi: patchText(body.npi),
      isPrimary: body.isPrimary,
      notes: patchText(body.notes),
    });
    const [row] = await db
      .update(clientContactsTable)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(clientContactsTable.clientId, client.id), eq(clientContactsTable.id, String(req.params.contactId))))
      .returning();
    if (!row) throw notFound("Contact not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.contact_updated", targetType: "client", targetId: client.id, details: { contactId: row.id, fields: Object.keys(values) } });
    res.json({ contact: toContactJson(row) });
  });

  router.delete("/clients/:id/contacts/:contactId", contactsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const [row] = await db
      .delete(clientContactsTable)
      .where(and(eq(clientContactsTable.clientId, client.id), eq(clientContactsTable.id, String(req.params.contactId))))
      .returning({ id: clientContactsTable.id, kind: clientContactsTable.kind });
    if (!row) throw notFound("Contact not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.contact_removed", targetType: "client", targetId: client.id, details: { contactId: row.id, kind: row.kind } });
    res.json({ ok: true });
  });

  // ── insurance policies ───────────────────────────────────────────────
  router.get("/clients/:id/policies", insuranceOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const rows = await db
      .select()
      .from(clientInsurancePoliciesTable)
      .where(eq(clientInsurancePoliciesTable.clientId, client.id))
      .orderBy(asc(clientInsurancePoliciesTable.policyType), desc(clientInsurancePoliciesTable.createdAt));
    res.json({ policies: rows.map(toPolicyJson) });
  });

  router.post("/clients/:id/policies", insuranceOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const body = PolicyBody.parse(req.body);
    let row: ClientInsurancePolicyRow | undefined;
    try {
      [row] = await db
        .insert(clientInsurancePoliciesTable)
        .values({
          orgId,
          clientId: client.id,
          policyType: body.policyType ?? "primary",
          payerName: body.payerName,
          memberId: blankToNull(body.memberId),
          groupNumber: blankToNull(body.groupNumber),
          status: body.status ?? "active",
          startDate: blankToNull(body.startDate),
          endDate: blankToNull(body.endDate),
          policyHolderName: blankToNull(body.policyHolderName),
          policyHolderRelationship: blankToNull(body.policyHolderRelationship),
          notes: blankToNull(body.notes),
        })
        .returning();
    } catch (e) {
      datesRefused(e);
    }
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.policy_added", targetType: "client", targetId: client.id, details: { policyId: row!.id, policyType: row!.policyType } });
    res.status(201).json({ policy: toPolicyJson(row!) });
  });

  router.patch("/clients/:id/policies/:policyId", insuranceOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const body = PolicyPatch.parse(req.body);
    const values = definedOnly({
      policyType: body.policyType,
      payerName: body.payerName,
      memberId: patchText(body.memberId),
      groupNumber: patchText(body.groupNumber),
      status: body.status,
      startDate: patchText(body.startDate),
      endDate: patchText(body.endDate),
      policyHolderName: patchText(body.policyHolderName),
      policyHolderRelationship: patchText(body.policyHolderRelationship),
      notes: patchText(body.notes),
    });
    let row: ClientInsurancePolicyRow | undefined;
    try {
      [row] = await db
        .update(clientInsurancePoliciesTable)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(clientInsurancePoliciesTable.clientId, client.id), eq(clientInsurancePoliciesTable.id, String(req.params.policyId))))
        .returning();
    } catch (e) {
      datesRefused(e);
    }
    if (!row) throw notFound("Policy not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.policy_updated", targetType: "client", targetId: client.id, details: { policyId: row.id, fields: Object.keys(values) } });
    res.json({ policy: toPolicyJson(row) });
  });

  router.delete("/clients/:id/policies/:policyId", insuranceOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const [row] = await db
      .delete(clientInsurancePoliciesTable)
      .where(and(eq(clientInsurancePoliciesTable.clientId, client.id), eq(clientInsurancePoliciesTable.id, String(req.params.policyId))))
      .returning({ id: clientInsurancePoliciesTable.id });
    if (!row) throw notFound("Policy not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.policy_removed", targetType: "client", targetId: client.id, details: { policyId: row.id } });
    res.json({ ok: true });
  });

  // ── prior authorizations ─────────────────────────────────────────────
  router.get("/clients/:id/authorizations", authorizationsOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const rows = await db
      .select()
      .from(clientAuthorizationsTable)
      .where(eq(clientAuthorizationsTable.clientId, client.id))
      .orderBy(desc(clientAuthorizationsTable.endDate), asc(clientAuthorizationsTable.service));
    res.json({ authorizations: rows.map(toAuthorizationJson) });
  });

  router.post("/clients/:id/authorizations", authorizationsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const body = AuthorizationBody.parse(req.body);
    if (body.endDate < body.startDate) throw badRequest("The end date must not be before the start date.");
    const [row] = await db
      .insert(clientAuthorizationsTable)
      .values({
        orgId,
        clientId: client.id,
        authNumber: blankToNull(body.authNumber),
        payerName: blankToNull(body.payerName),
        service: body.service,
        billingCode: blankToNull(body.billingCode)?.toUpperCase() ?? null,
        startDate: body.startDate,
        endDate: body.endDate,
        approvedUnits: body.approvedUnits,
        unitBasis: body.unitBasis ?? "unit",
        weeklyCapUnits: body.weeklyCapUnits ?? null,
        ratePerUnit: body.ratePerUnit ?? null,
        status: body.status ?? "active",
        permitOverBudget: body.permitOverBudget ?? false,
        excludeFromSubmission: body.excludeFromSubmission ?? false,
        notes: blankToNull(body.notes),
      })
      .returning();
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.authorization_added", targetType: "client", targetId: client.id, details: { authorizationId: row!.id, service: body.service } });
    res.status(201).json({ authorization: toAuthorizationJson(row!) });
  });

  router.patch("/clients/:id/authorizations/:authorizationId", authorizationsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const body = AuthorizationPatch.parse(req.body);
    const values = definedOnly({
      authNumber: patchText(body.authNumber),
      payerName: patchText(body.payerName),
      service: body.service,
      billingCode: body.billingCode === undefined ? undefined : body.billingCode === "" ? null : body.billingCode.toUpperCase(),
      startDate: body.startDate,
      endDate: body.endDate,
      approvedUnits: body.approvedUnits,
      unitBasis: body.unitBasis,
      weeklyCapUnits: body.weeklyCapUnits,
      ratePerUnit: body.ratePerUnit,
      status: body.status,
      permitOverBudget: body.permitOverBudget,
      excludeFromSubmission: body.excludeFromSubmission,
      notes: patchText(body.notes),
    });
    let row: ClientAuthorizationRow | undefined;
    try {
      [row] = await db
        .update(clientAuthorizationsTable)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(clientAuthorizationsTable.clientId, client.id), eq(clientAuthorizationsTable.id, String(req.params.authorizationId))))
        .returning();
    } catch (e) {
      datesRefused(e);
    }
    if (!row) throw notFound("Authorization not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.authorization_updated", targetType: "client", targetId: client.id, details: { authorizationId: row.id, fields: Object.keys(values) } });
    res.json({ authorization: toAuthorizationJson(row) });
  });

  router.delete("/clients/:id/authorizations/:authorizationId", authorizationsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const [row] = await db
      .delete(clientAuthorizationsTable)
      .where(and(eq(clientAuthorizationsTable.clientId, client.id), eq(clientAuthorizationsTable.id, String(req.params.authorizationId))))
      .returning({ id: clientAuthorizationsTable.id, service: clientAuthorizationsTable.service });
    if (!row) throw notFound("Authorization not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.authorization_removed", targetType: "client", targetId: client.id, details: { authorizationId: row.id, service: row.service } });
    res.json({ ok: true });
  });

  // ── files on record ──────────────────────────────────────────────────
  const fileColumns = {
    id: clientFilesTable.id,
    orgId: clientFilesTable.orgId,
    clientId: clientFilesTable.clientId,
    category: clientFilesTable.category,
    fileName: clientFilesTable.fileName,
    contentType: clientFilesTable.contentType,
    sizeBytes: clientFilesTable.sizeBytes,
    startDate: clientFilesTable.startDate,
    endDate: clientFilesTable.endDate,
    notes: clientFilesTable.notes,
    uploadedByUserId: clientFilesTable.uploadedByUserId,
    createdAt: clientFilesTable.createdAt,
    updatedAt: clientFilesTable.updatedAt,
  };

  router.get("/clients/:id/files", paperworkOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const rows = await db
      .select(fileColumns)
      .from(clientFilesTable)
      .where(eq(clientFilesTable.clientId, client.id))
      .orderBy(asc(clientFilesTable.category), desc(clientFilesTable.createdAt));
    res.json({ files: rows.map(toFileJson), categories: CLIENT_FILE_CATEGORIES, maxBytes: CLIENT_FILE_MAX_BYTES, contentTypes: CLIENT_FILE_CONTENT_TYPES });
  });

  /**
   * The upload: the file's bytes as the request body, its name, category and
   * dates in the query string, its type in Content-Type. The JSON parser does
   * not touch it (wrong content type); the raw parser here caps it at the
   * folder's limit and answers 413 above it.
   */
  router.post("/clients/:id/files", paperworkOn, raw({ type: () => true, limit: CLIENT_FILE_MAX_BYTES }), async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const meta = FileMeta.parse(req.query);
    const contentType = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!(CLIENT_FILE_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw badRequest("That kind of file is not accepted here. Upload a PDF, an image, a Word or Excel document, or a text file.");
    }
    const content = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.alloc(0);
    if (content.length === 0) throw badRequest("The upload was empty.");
    if (meta.startDate && meta.endDate && meta.endDate < meta.startDate) throw badRequest("The end date must not be before the start date.");
    const [row] = await db
      .insert(clientFilesTable)
      .values({
        orgId,
        clientId: client.id,
        category: meta.category,
        fileName: meta.fileName,
        contentType,
        sizeBytes: content.length,
        content,
        startDate: blankToNull(meta.startDate),
        endDate: blankToNull(meta.endDate),
        notes: blankToNull(meta.notes),
        uploadedByUserId: auth.realUser.id,
      })
      .returning(fileColumns);
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.file_added", targetType: "client", targetId: client.id, details: { fileId: row!.id, category: meta.category, sizeBytes: content.length } });
    res.status(201).json({ file: toFileJson(row!) });
  });

  router.get("/clients/:id/files/:fileId/content", paperworkOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const [row] = await db
      .select()
      .from(clientFilesTable)
      .where(and(eq(clientFilesTable.clientId, client.id), eq(clientFilesTable.id, String(req.params.fileId))))
      .limit(1);
    if (!row) throw notFound("File not found.");
    // Always a download, never rendered in the portal's own origin: a PDF or
    // HTML-looking upload must not be able to run as the portal.
    res.setHeader("Content-Type", row.contentType);
    res.setHeader("Content-Length", String(row.sizeBytes));
    res.setHeader("Content-Disposition", `attachment; filename="${dispositionName(row.fileName)}"`);
    res.setHeader("Content-Security-Policy", "sandbox");
    res.send(row.content);
  });

  router.patch("/clients/:id/files/:fileId", paperworkOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const body = FilePatch.parse(req.body);
    const values = definedOnly({
      fileName: body.fileName,
      category: body.category,
      startDate: patchText(body.startDate),
      endDate: patchText(body.endDate),
      notes: patchText(body.notes),
    });
    let row: Omit<ClientFileRow, "content"> | undefined;
    try {
      [row] = await db
        .update(clientFilesTable)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(clientFilesTable.clientId, client.id), eq(clientFilesTable.id, String(req.params.fileId))))
        .returning(fileColumns);
    } catch (e) {
      datesRefused(e);
    }
    if (!row) throw notFound("File not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.file_updated", targetType: "client", targetId: client.id, details: { fileId: row.id, fields: Object.keys(values) } });
    res.json({ file: toFileJson(row) });
  });

  router.delete("/clients/:id/files/:fileId", paperworkOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const client = await loadClient(db, orgId, String(req.params.id));
    const [row] = await db
      .delete(clientFilesTable)
      .where(and(eq(clientFilesTable.clientId, client.id), eq(clientFilesTable.id, String(req.params.fileId))))
      .returning({ id: clientFilesTable.id, category: clientFilesTable.category });
    if (!row) throw notFound("File not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "client.file_removed", targetType: "client", targetId: client.id, details: { fileId: row.id, category: row.category } });
    res.json({ ok: true });
  });

  return router;
}

