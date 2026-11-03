// Billing configuration and the claim ledger.
//
//   billing.codes   /billing/payers, /billing/codes   who gets billed and the
//                                                       fee schedule (Admin only)
//   billing.claims  /billing/submissions              the ledger of 837P batches
//
// The ledger is two-phase, as the export has always been: a row is opened
// (control number reserved, nothing billed), the file is built against that
// number, and only then is the row finalized with the file attached. A row
// that never reaches that point is discarded. The payer's answer is recorded
// on the row afterwards, so "what came back" is finally somewhere.
//
// Everything is scoped to the caller's organization. Billing is Admin work:
// the catalog grants these keys to no employee role, and the routes say so
// too, so a Scheduler who somehow holds the key is still refused.
import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  BILLING_SERVICES,
  BILLING_UNITS,
  CLAIM_FILING_CODES,
  PAYER_KINDS,
  SUBMISSION_STATUSES,
  billingCodesTable,
  claimSubmissionsTable,
  payersTable,
  type BillingCodeRow,
  type ClaimSubmissionRow,
  type Db,
  type PayerRow,
} from "@workspace/db";
import { recordAudit, type AuditEntry } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { badRequest, conflict, notFound } from "../lib/errors";
import type { Mailer } from "../lib/mail";
import { requireAuth, requireAuthContext, requireFeature, requireOrgId, requireRole, type AuthContext } from "../middlewares/auth";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalDate = z.union([z.literal(""), isoDate]).optional();
const modifier = z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2}$/, "A modifier is two letters or digits.")]).optional();

const PayerBody = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(PAYER_KINDS).optional(),
  payerId: optionalText(40),
  claimFilingCode: z.enum(CLAIM_FILING_CODES).optional(),
  address1: optionalText(200),
  city: optionalText(120),
  state: optionalText(2),
  zip: optionalText(10),
  phone: optionalText(40),
  notes: optionalText(2000),
  active: z.boolean().optional(),
});
const PayerPatch = PayerBody.partial();

const CodeBody = z.object({
  payerId: z.uuid().nullable().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,6}$/, "A procedure code is four to six letters or digits."),
  modifier1: modifier,
  modifier2: modifier,
  modifier3: modifier,
  modifier4: modifier,
  description: z.string().trim().min(1).max(200),
  service: z.enum(BILLING_SERVICES),
  billingUnit: z.enum(BILLING_UNITS).optional(),
  ratePerUnit: z.coerce.number().min(0).max(100_000),
  effectiveDate: isoDate,
  endDate: optionalDate,
  evvCode: optionalText(20),
  allowZeroUnits: z.boolean().optional(),
  archived: z.boolean().optional(),
  notes: optionalText(2000),
});
const CodePatch = CodeBody.partial();

const SubmissionOpen = z.object({
  noteIds: z.array(z.string().min(1).max(80)).min(1).max(5000),
  totalUnits: z.coerce.number().min(0),
  totalCharge: z.coerce.number().min(0),
  payerKey: z.string().trim().min(1).max(40),
  payerId: z.uuid().nullable().optional(),
  testMode: z.boolean().optional(),
  periodStart: optionalDate,
  periodEnd: optionalDate,
});
const SubmissionFinalize = z.object({
  fileContent: z.string().min(1).max(20_000_000),
  fileName: z.string().trim().min(1).max(200),
});
const SubmissionPatch = z.object({
  status: z.enum(SUBMISSION_STATUSES.filter((s) => s !== "open") as [string, ...string[]]),
  statusNote: optionalText(2000),
});

/** From an open row, only these answers make sense; from a closed one, only the ones that follow it. */
const NEXT_STATUSES: Record<string, readonly string[]> = {
  open: [],
  submitted: ["accepted", "rejected", "paid", "denied", "voided"],
  accepted: ["paid", "denied", "voided"],
  rejected: ["submitted", "voided"],
  paid: ["voided"],
  denied: ["submitted", "voided"],
  voided: [],
};

export function toPayerJson(r: PayerRow) {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    payerId: r.payerId,
    claimFilingCode: r.claimFilingCode,
    address1: r.address1,
    city: r.city,
    state: r.state,
    zip: r.zip,
    phone: r.phone,
    notes: r.notes,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toCodeJson(r: BillingCodeRow) {
  return {
    id: r.id,
    payerId: r.payerId,
    code: r.code,
    modifier1: r.modifier1,
    modifier2: r.modifier2,
    modifier3: r.modifier3,
    modifier4: r.modifier4,
    description: r.description,
    service: r.service,
    billingUnit: r.billingUnit,
    ratePerUnit: r.ratePerUnit,
    effectiveDate: r.effectiveDate,
    endDate: r.endDate,
    evvCode: r.evvCode,
    allowZeroUnits: r.allowZeroUnits,
    archived: r.archived,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** The ledger row without the file; the file is its own download. */
export function toSubmissionJson(r: Omit<ClaimSubmissionRow, "fileContent">) {
  return {
    id: r.id,
    controlNumber: r.controlNumber,
    payerId: r.payerId,
    payerKey: r.payerKey,
    format: r.format,
    testMode: r.testMode,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    noteIds: r.noteIds,
    noteCount: r.noteCount,
    totalUnits: r.totalUnits,
    totalCharge: r.totalCharge,
    status: r.status,
    statusNote: r.statusNote,
    fileName: r.fileName,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    respondedAt: r.respondedAt?.toISOString() ?? null,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const blankToNull = (v: string | undefined): string | null => (v === undefined || v === "" ? null : v);
const patchText = (v: string | undefined): string | null | undefined => (v === undefined ? undefined : v === "" ? null : v);

function definedOnly<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function uniqueViolationOf(e: unknown, depth = 0): string | null {
  if (typeof e !== "object" || e === null || depth > 3) return null;
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === "23505") return constraint ?? "";
  return uniqueViolationOf((e as { cause?: unknown }).cause, depth + 1);
}

function checkViolationOf(e: unknown, depth = 0): string | null {
  if (typeof e !== "object" || e === null || depth > 3) return null;
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === "23514") return constraint ?? "";
  return checkViolationOf((e as { cause?: unknown }).cause, depth + 1);
}

function datesRefused(e: unknown): never {
  const violated = checkViolationOf(e);
  if (violated && violated.endsWith("_dates_check")) throw badRequest("The end date must not be before the effective date.");
  throw e;
}

const submissionColumns = {
  id: claimSubmissionsTable.id,
  orgId: claimSubmissionsTable.orgId,
  controlNumber: claimSubmissionsTable.controlNumber,
  payerId: claimSubmissionsTable.payerId,
  payerKey: claimSubmissionsTable.payerKey,
  format: claimSubmissionsTable.format,
  testMode: claimSubmissionsTable.testMode,
  periodStart: claimSubmissionsTable.periodStart,
  periodEnd: claimSubmissionsTable.periodEnd,
  noteIds: claimSubmissionsTable.noteIds,
  noteCount: claimSubmissionsTable.noteCount,
  totalUnits: claimSubmissionsTable.totalUnits,
  totalCharge: claimSubmissionsTable.totalCharge,
  status: claimSubmissionsTable.status,
  statusNote: claimSubmissionsTable.statusNote,
  fileName: claimSubmissionsTable.fileName,
  submittedAt: claimSubmissionsTable.submittedAt,
  respondedAt: claimSubmissionsTable.respondedAt,
  createdByUserId: claimSubmissionsTable.createdByUserId,
  createdAt: claimSubmissionsTable.createdAt,
  updatedAt: claimSubmissionsTable.updatedAt,
};

export function billingRouter(db: Db, _config: AppConfig, _deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();
  router.use("/billing", requireAuth, requireRole("Admin"));
  const codesOn = requireFeature("billing.codes");
  const claimsOn = requireFeature("billing.claims");

  function actorFor(req: { ip?: string }, auth: AuthContext, orgId: string): Omit<AuditEntry, "action" | "targetType"> {
    return {
      orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      ip: req.ip ?? null,
    };
  }

  async function payerInOrg(orgId: string, payerId: string | null | undefined): Promise<void> {
    if (!payerId) return;
    const [row] = await db.select({ id: payersTable.id }).from(payersTable).where(and(eq(payersTable.orgId, orgId), eq(payersTable.id, payerId))).limit(1);
    if (!row) throw badRequest("That payer does not exist.");
  }

  // ── payers ───────────────────────────────────────────────────────────
  router.get("/billing/payers", codesOn, async (_req, res) => {
    const orgId = requireOrgId(res);
    const rows = await db.select().from(payersTable).where(eq(payersTable.orgId, orgId)).orderBy(desc(payersTable.active), asc(payersTable.name));
    res.json({ payers: rows.map(toPayerJson) });
  });

  router.post("/billing/payers", codesOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = PayerBody.parse(req.body);
    let row: PayerRow | undefined;
    try {
      [row] = await db
        .insert(payersTable)
        .values({
          orgId,
          name: body.name,
          kind: body.kind ?? "medicaid",
          payerId: blankToNull(body.payerId),
          claimFilingCode: body.claimFilingCode ?? "MC",
          address1: blankToNull(body.address1),
          city: blankToNull(body.city),
          state: blankToNull(body.state)?.toUpperCase() ?? null,
          zip: blankToNull(body.zip),
          phone: blankToNull(body.phone),
          notes: blankToNull(body.notes),
          active: body.active ?? true,
        })
        .returning();
    } catch (e) {
      if (uniqueViolationOf(e) !== null) throw conflict("PAYER_EXISTS", "A payer with that name already exists.");
      throw e;
    }
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "billing.payer_added", targetType: "payer", targetId: row!.id, details: { name: body.name } });
    res.status(201).json({ payer: toPayerJson(row!) });
  });

  router.patch("/billing/payers/:id", codesOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = PayerPatch.parse(req.body);
    const values = definedOnly({
      name: body.name,
      kind: body.kind,
      payerId: patchText(body.payerId),
      claimFilingCode: body.claimFilingCode,
      address1: patchText(body.address1),
      city: patchText(body.city),
      state: body.state === undefined ? undefined : body.state === "" ? null : body.state.toUpperCase(),
      zip: patchText(body.zip),
      phone: patchText(body.phone),
      notes: patchText(body.notes),
      active: body.active,
    });
    let row: PayerRow | undefined;
    try {
      [row] = await db
        .update(payersTable)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(payersTable.orgId, orgId), eq(payersTable.id, String(req.params.id))))
        .returning();
    } catch (e) {
      if (uniqueViolationOf(e) !== null) throw conflict("PAYER_EXISTS", "A payer with that name already exists.");
      throw e;
    }
    if (!row) throw notFound("Payer not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "billing.payer_updated", targetType: "payer", targetId: row.id, details: { fields: Object.keys(values) } });
    res.json({ payer: toPayerJson(row) });
  });

  router.delete("/billing/payers/:id", codesOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const [row] = await db
      .delete(payersTable)
      .where(and(eq(payersTable.orgId, orgId), eq(payersTable.id, String(req.params.id))))
      .returning({ id: payersTable.id, name: payersTable.name });
    if (!row) throw notFound("Payer not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "billing.payer_removed", targetType: "payer", targetId: row.id, details: { name: row.name } });
    res.json({ ok: true });
  });

  // ── billing codes (the fee schedule) ─────────────────────────────────
  router.get("/billing/codes", codesOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const includeArchived = req.query.archived === "true";
    const rows = await db
      .select()
      .from(billingCodesTable)
      .where(includeArchived ? eq(billingCodesTable.orgId, orgId) : and(eq(billingCodesTable.orgId, orgId), eq(billingCodesTable.archived, false)))
      .orderBy(asc(billingCodesTable.service), asc(billingCodesTable.code), desc(billingCodesTable.effectiveDate));
    res.json({ codes: rows.map(toCodeJson) });
  });

  router.post("/billing/codes", codesOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = CodeBody.parse(req.body);
    await payerInOrg(orgId, body.payerId);
    if (body.endDate && body.endDate < body.effectiveDate) throw badRequest("The end date must not be before the effective date.");
    const [row] = await db
      .insert(billingCodesTable)
      .values({
        orgId,
        payerId: body.payerId ?? null,
        code: body.code,
        modifier1: blankToNull(body.modifier1),
        modifier2: blankToNull(body.modifier2),
        modifier3: blankToNull(body.modifier3),
        modifier4: blankToNull(body.modifier4),
        description: body.description,
        service: body.service,
        billingUnit: body.billingUnit ?? "15_min",
        ratePerUnit: body.ratePerUnit,
        effectiveDate: body.effectiveDate,
        endDate: blankToNull(body.endDate),
        evvCode: blankToNull(body.evvCode),
        allowZeroUnits: body.allowZeroUnits ?? false,
        archived: body.archived ?? false,
        notes: blankToNull(body.notes),
      })
      .returning();
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "billing.code_added", targetType: "billing_code", targetId: row!.id, details: { code: body.code, service: body.service } });
    res.status(201).json({ code: toCodeJson(row!) });
  });

  router.patch("/billing/codes/:id", codesOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = CodePatch.parse(req.body);
    await payerInOrg(orgId, body.payerId);
    const values = definedOnly({
      payerId: body.payerId,
      code: body.code,
      modifier1: patchText(body.modifier1),
      modifier2: patchText(body.modifier2),
      modifier3: patchText(body.modifier3),
      modifier4: patchText(body.modifier4),
      description: body.description,
      service: body.service,
      billingUnit: body.billingUnit,
      ratePerUnit: body.ratePerUnit,
      effectiveDate: body.effectiveDate,
      endDate: patchText(body.endDate),
      evvCode: patchText(body.evvCode),
      allowZeroUnits: body.allowZeroUnits,
      archived: body.archived,
      notes: patchText(body.notes),
    });
    let row: BillingCodeRow | undefined;
    try {
      [row] = await db
        .update(billingCodesTable)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(billingCodesTable.orgId, orgId), eq(billingCodesTable.id, String(req.params.id))))
        .returning();
    } catch (e) {
      datesRefused(e);
    }
    if (!row) throw notFound("Billing code not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "billing.code_updated", targetType: "billing_code", targetId: row.id, details: { code: row.code, fields: Object.keys(values) } });
    res.json({ code: toCodeJson(row) });
  });

  /** A copy to edit: the same code with a new effective date, or the same rate for another payer. */
  router.post("/billing/codes/:id/duplicate", codesOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const [source] = await db.select().from(billingCodesTable).where(and(eq(billingCodesTable.orgId, orgId), eq(billingCodesTable.id, String(req.params.id)))).limit(1);
    if (!source) throw notFound("Billing code not found.");
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = source;
    const [row] = await db.insert(billingCodesTable).values({ ...rest, archived: false, notes: `Copy of ${source.code}${source.notes ? ` — ${source.notes}` : ""}` }).returning();
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "billing.code_added", targetType: "billing_code", targetId: row!.id, details: { code: row!.code, service: row!.service, copiedFrom: source.id } });
    res.status(201).json({ code: toCodeJson(row!) });
  });

  router.delete("/billing/codes/:id", codesOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const [row] = await db
      .delete(billingCodesTable)
      .where(and(eq(billingCodesTable.orgId, orgId), eq(billingCodesTable.id, String(req.params.id))))
      .returning({ id: billingCodesTable.id, code: billingCodesTable.code });
    if (!row) throw notFound("Billing code not found.");
    await recordAudit(db, { ...actorFor(req, auth, orgId), action: "billing.code_removed", targetType: "billing_code", targetId: row.id, details: { code: row.code } });
    res.json({ ok: true });
  });

  // ── the claim ledger ─────────────────────────────────────────────────
  router.get("/billing/submissions", claimsOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const rows = await db
      .select(submissionColumns)
      .from(claimSubmissionsTable)
      .where(eq(claimSubmissionsTable.orgId, orgId))
      .orderBy(desc(claimSubmissionsTable.createdAt))
      .limit(limit);
    res.json({ submissions: rows.map(toSubmissionJson) });
  });

  /** Phase 1: reserve a control number. Nothing is billed yet. */
  router.post("/billing/submissions", claimsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = SubmissionOpen.parse(req.body);
    await payerInOrg(orgId, body.payerId);
    const [row] = await db
      .insert(claimSubmissionsTable)
      .values({
        orgId,
        payerId: body.payerId ?? null,
        payerKey: body.payerKey,
        testMode: body.testMode ?? false,
        periodStart: blankToNull(body.periodStart),
        periodEnd: blankToNull(body.periodEnd),
        noteIds: body.noteIds,
        noteCount: body.noteIds.length,
        totalUnits: body.totalUnits,
        totalCharge: body.totalCharge,
        status: "open",
        createdByUserId: auth.realUser.id,
      })
      .returning(submissionColumns);
    res.status(201).json({ submission: toSubmissionJson(row!) });
  });

  /** Phase 2: attach the file. Only an open row can be finalized, and only once. */
  router.post("/billing/submissions/:id/finalize", claimsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = SubmissionFinalize.parse(req.body);
    const now = new Date();
    const [row] = await db
      .update(claimSubmissionsTable)
      .set({ fileContent: body.fileContent, fileName: body.fileName, status: "submitted", submittedAt: now, updatedAt: now })
      .where(and(eq(claimSubmissionsTable.orgId, orgId), eq(claimSubmissionsTable.id, String(req.params.id)), eq(claimSubmissionsTable.status, "open")))
      .returning(submissionColumns);
    if (!row) throw conflict("SUBMISSION_NOT_OPEN", "That batch is not open, so its file cannot be attached.");
    await recordAudit(db, {
      ...actorFor(req, auth, orgId),
      action: "billing.claims_exported",
      targetType: "claim_submission",
      targetId: row.id,
      details: { controlNumber: row.controlNumber, notes: row.noteCount, totalUnits: row.totalUnits, totalCharge: row.totalCharge, payer: row.payerKey, testMode: row.testMode },
    });
    res.json({ submission: toSubmissionJson(row) });
  });

  /** Discard an open row whose file could not be built. A finalized row is never deleted; it is voided. */
  router.delete("/billing/submissions/:id", claimsOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const [row] = await db
      .delete(claimSubmissionsTable)
      .where(and(eq(claimSubmissionsTable.orgId, orgId), eq(claimSubmissionsTable.id, String(req.params.id)), eq(claimSubmissionsTable.status, "open")))
      .returning({ id: claimSubmissionsTable.id });
    if (!row) throw conflict("SUBMISSION_NOT_OPEN", "Only an open batch can be discarded; a sent one is voided instead.");
    res.json({ ok: true });
  });

  /** What the payer said: accepted, rejected, paid, denied — or voided by us. */
  router.patch("/billing/submissions/:id", claimsOn, async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = SubmissionPatch.parse(req.body);
    const [current] = await db.select(submissionColumns).from(claimSubmissionsTable).where(and(eq(claimSubmissionsTable.orgId, orgId), eq(claimSubmissionsTable.id, String(req.params.id)))).limit(1);
    if (!current) throw notFound("Batch not found.");
    if (!NEXT_STATUSES[current.status]!.includes(body.status)) {
      throw conflict("SUBMISSION_STATUS", `A batch that is ${current.status} cannot become ${body.status}.`);
    }
    const now = new Date();
    const [row] = await db
      .update(claimSubmissionsTable)
      .set({ status: body.status as ClaimSubmissionRow["status"], statusNote: blankToNull(body.statusNote), respondedAt: now, updatedAt: now })
      .where(eq(claimSubmissionsTable.id, current.id))
      .returning(submissionColumns);
    await recordAudit(db, {
      ...actorFor(req, auth, orgId),
      action: "billing.submission_status_changed",
      targetType: "claim_submission",
      targetId: current.id,
      details: { controlNumber: current.controlNumber, from: current.status, to: body.status },
    });
    res.json({ submission: toSubmissionJson(row!) });
  });

  router.get("/billing/submissions/:id/file", claimsOn, async (req, res) => {
    const orgId = requireOrgId(res);
    const [row] = await db
      .select({ fileContent: claimSubmissionsTable.fileContent, fileName: claimSubmissionsTable.fileName, controlNumber: claimSubmissionsTable.controlNumber })
      .from(claimSubmissionsTable)
      .where(and(eq(claimSubmissionsTable.orgId, orgId), eq(claimSubmissionsTable.id, String(req.params.id))))
      .limit(1);
    if (!row) throw notFound("Batch not found.");
    if (!row.fileContent) throw conflict("SUBMISSION_NOT_OPEN", "That batch has no file yet.");
    const name = (row.fileName ?? `dls-837p-cn${row.controlNumber}.txt`).replace(/[^\x20-\x7e]/g, "_").replace(/["\\/]/g, "_");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(row.fileContent);
  });

  return router;
}
