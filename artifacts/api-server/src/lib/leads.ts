// artifacts/api-server/src/lib/leads.ts — what the public form and the inbox
// share: resolving which organization a website submission belongs to,
// validating answers against the organization's own question list, the
// funnel's structural stages, and the writes that keep a lead's timeline in
// step with its row.
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import {
  consultationRequests,
  leadActivitiesTable,
  leadFormQuestionsTable,
  leadStagesTable,
  leadSubmissionAttemptsTable,
  leadsTable,
  organizationsTable,
  type Db,
  type LeadActivityRow,
  type LeadActivityType,
  type LeadAnswers,
  type LeadFormQuestionRow,
  type LeadQuestionSnapshot,
  type LeadQuestionType,
  type LeadRow,
  type LeadSource,
  type LeadStageKind,
  type LeadStageRow,
  type LeadSubmissionOutcome,
  type Organization,
} from "@workspace/db";
import { isFeatureEnabledFor } from "@workspace/features";
import { recordAudit } from "./audit";
import type { AppConfig } from "./config";
import { HttpError, notFound } from "./errors";
import { loadFeatureStates } from "./features";

/** A Drizzle handle or a transaction opened on one. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// ── the organization behind a public request ────────────────────────────────

/**
 * Which organization a session-less request is for, and whether that
 * organization is taking inquiries at all. Both failures answer 404 so that
 * switching the feature off closes the public surface completely.
 */
export async function resolvePublicOrg(db: Db, config: AppConfig, slug?: string): Promise<Organization> {
  const wanted = (slug ?? "").trim().toLowerCase() || config.defaultOrgSlug;
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, wanted)).limit(1);
  if (!org || org.status !== "active") throw notFound("No such form.");
  const state = (await loadFeatureStates(db, org.id)).find((s) => s.key === "leads.inbox");
  if (!state || !isFeatureEnabledFor(state, "Admin")) throw notFound("No such form.");
  return org;
}

// ── stages and questions ────────────────────────────────────────────────────

export async function listStages(db: DbOrTx, orgId: string, opts: { includeInactive?: boolean } = {}): Promise<LeadStageRow[]> {
  const where = opts.includeInactive
    ? eq(leadStagesTable.orgId, orgId)
    : and(eq(leadStagesTable.orgId, orgId), eq(leadStagesTable.active, true));
  return db.select().from(leadStagesTable).where(where).orderBy(asc(leadStagesTable.sortOrder), asc(leadStagesTable.createdAt));
}

export async function findStage(db: DbOrTx, orgId: string, id: string): Promise<LeadStageRow | undefined> {
  const rows = await db
    .select()
    .from(leadStagesTable)
    .where(and(eq(leadStagesTable.orgId, orgId), eq(leadStagesTable.id, id)))
    .limit(1);
  return rows[0];
}

/** Where a new inquiry lands: the first active open stage in display order. */
export async function firstOpenStage(db: DbOrTx, orgId: string): Promise<LeadStageRow> {
  const rows = await db
    .select()
    .from(leadStagesTable)
    .where(and(eq(leadStagesTable.orgId, orgId), eq(leadStagesTable.active, true), eq(leadStagesTable.kind, "open")))
    .orderBy(asc(leadStagesTable.sortOrder), asc(leadStagesTable.createdAt))
    .limit(1);
  const stage = rows[0];
  if (!stage) throw new HttpError(503, "NO_OPEN_STAGE", "The funnel has no open stage to receive inquiries.");
  return stage;
}

/** The structural stage of a kind (won = converted, lost = closed). */
export async function stageOfKind(db: DbOrTx, orgId: string, kind: Exclude<LeadStageKind, "open">): Promise<LeadStageRow | undefined> {
  const rows = await db
    .select()
    .from(leadStagesTable)
    .where(and(eq(leadStagesTable.orgId, orgId), eq(leadStagesTable.active, true), eq(leadStagesTable.kind, kind)))
    .orderBy(asc(leadStagesTable.sortOrder))
    .limit(1);
  return rows[0];
}

export async function listQuestions(
  db: DbOrTx,
  orgId: string,
  opts: { includeInactive?: boolean } = {}
): Promise<LeadFormQuestionRow[]> {
  const where = opts.includeInactive
    ? eq(leadFormQuestionsTable.orgId, orgId)
    : and(eq(leadFormQuestionsTable.orgId, orgId), eq(leadFormQuestionsTable.active, true));
  return db
    .select()
    .from(leadFormQuestionsTable)
    .where(where)
    .orderBy(asc(leadFormQuestionsTable.sortOrder), asc(leadFormQuestionsTable.createdAt));
}

/** What the website is told about a question — never a row id. */
export interface PublicQuestion {
  key: string;
  label: string;
  helpText: string | null;
  type: LeadQuestionType;
  options: string[];
  required: boolean;
  /** Longest answer the API accepts; null for a checkbox. */
  maxLength: number | null;
}

export function toPublicQuestion(q: LeadFormQuestionRow): PublicQuestion {
  return {
    key: q.key,
    label: q.label,
    helpText: q.helpText,
    type: q.type,
    options: q.options,
    required: q.required,
    maxLength: q.type === "yes_no" ? null : ANSWER_LIMITS[q.type],
  };
}

export function snapshotOf(questions: readonly LeadFormQuestionRow[]): LeadQuestionSnapshot[] {
  return questions.map((q) => ({ key: q.key, label: q.label, type: q.type }));
}

// ── validating a submission ─────────────────────────────────────────────────

export const ANSWER_LIMITS: Record<Exclude<LeadQuestionType, "yes_no">, number> = {
  short_text: 200,
  long_text: 5000,
  email: 254,
  phone: 40,
  select: 200,
};

const YES_VALUES = new Set(["yes", "on", "true", "1"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]*(?:(?:ext|x)\.?\s*[0-9]+)?$/i;

export interface SubmissionIssue {
  key: string;
  message: string;
}

export interface ParsedSubmission {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  consent: boolean;
  answers: LeadAnswers;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * Check a flat body (question key → value) against the organization's active
 * questions. Unknown keys are ignored; every issue is reported at once so the
 * form can show them all. Throws the same 400 shape as a Zod failure.
 */
export function parseSubmission(questions: readonly LeadFormQuestionRow[], body: Record<string, unknown>): ParsedSubmission {
  const issues: SubmissionIssue[] = [];
  const answers: LeadAnswers = {};

  for (const q of questions) {
    const raw = body[q.key];
    if (q.type === "yes_no") {
      const yes = raw === true || (typeof raw === "string" && YES_VALUES.has(raw.trim().toLowerCase()));
      if (q.required && !yes) issues.push({ key: q.key, message: `Please confirm: ${q.label}` });
      answers[q.key] = yes;
      continue;
    }
    const text = textOf(raw);
    if (!text) {
      if (q.required) issues.push({ key: q.key, message: `${q.label} is required.` });
      answers[q.key] = null;
      continue;
    }
    const limit = ANSWER_LIMITS[q.type];
    if (text.length > limit) {
      issues.push({ key: q.key, message: `${q.label} must be ${limit} characters or fewer.` });
      continue;
    }
    switch (q.type) {
      case "email":
        if (!EMAIL_RE.test(text)) issues.push({ key: q.key, message: "Enter a valid email address." });
        else answers[q.key] = text.toLowerCase();
        break;
      case "phone":
        if (!PHONE_RE.test(text) || text.replace(/\D/g, "").length < 7) issues.push({ key: q.key, message: "Enter a valid phone number." });
        else answers[q.key] = text;
        break;
      case "select":
        if (!q.options.includes(text)) issues.push({ key: q.key, message: `${q.label}: choose one of the listed options.` });
        else answers[q.key] = text;
        break;
      default:
        answers[q.key] = text;
    }
  }

  const firstName = textOf(answers.firstName);
  const lastName = textOf(answers.lastName);
  if (!firstName && !issues.some((i) => i.key === "firstName")) issues.push({ key: "firstName", message: "First name is required." });
  if (!lastName && !issues.some((i) => i.key === "lastName")) issues.push({ key: "lastName", message: "Last name is required." });

  if (issues.length > 0) {
    throw new HttpError(400, "VALIDATION", issues.map((i) => i.message).join(" "), issues);
  }
  return {
    firstName,
    lastName,
    email: textOf(answers.email) || null,
    phone: textOf(answers.phone) || null,
    consent: answers.consent === true,
    answers,
  };
}

/** The page the form was on, as a path. A query string could carry anything, so it is dropped. */
export function pagePathOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname.slice(0, 200);
    } catch {
      return null;
    }
  }
  return value.startsWith("/") ? value.split("?")[0]!.slice(0, 200) : null;
}

// ── leads ───────────────────────────────────────────────────────────────────

export async function findLead(db: DbOrTx, orgId: string, id: string): Promise<LeadRow | undefined> {
  const rows = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.id, id)))
    .limit(1);
  return rows[0];
}

/**
 * The lead, locked until the transaction ends. Anything else that wants to
 * change this row — a conversion, a stage move, an assignment — waits here
 * and then reads the row as this transaction left it, so a decision taken on
 * what the row looked like a moment ago cannot be written over what it has
 * since become.
 */
export async function lockLead(tx: DbOrTx, orgId: string, id: string): Promise<LeadRow | undefined> {
  const rows = await tx
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.id, id)))
    .limit(1)
    .for("update");
  return rows[0];
}

/** The lead a website submission key created, if that key has been seen. */
async function findBySubmissionId(tx: DbOrTx, orgId: string, submissionId: string): Promise<LeadRow | undefined> {
  const rows = await tx
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.submissionId, submissionId)))
    .limit(1);
  return rows[0];
}

/** Leads this email created inside the window, newest first. */
async function listRecentByEmail(tx: DbOrTx, orgId: string, email: string, since: Date): Promise<LeadRow[]> {
  return tx
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.email, email), gte(leadsTable.createdAt, since)))
    .orderBy(desc(leadsTable.createdAt))
    .limit(20);
}

// ── a website submission ────────────────────────────────────────────────────
//
// What the website sends can reach here more than once: a dropped receipt and
// a click on "send" again, a refresh, a second try after a validation error, a
// bot posting in a loop. Three questions are settled in one transaction, under
// a lock on the submitting address so that simultaneous requests from it are
// answered one after another:
//
//   1. Has this address attempted too often? Every attempt counts — a retry,
//      a rejected form, a honeypot hit — because what is being limited is
//      traffic, not successes. Counting under the lock means N requests at
//      once cannot each see "one below the limit".
//   2. Is this a retry of a submission already stored? The website sends a key
//      per filled-in form (`submissionId`), kept across its retries; the key
//      is the answer. Without a key, the same answers from the same email
//      inside the window are the same submission. Either way the earlier
//      inquiry gets a timeline entry and nothing is lost, because nothing new
//      was said.
//   3. Otherwise it is an inquiry in its own right, even from an email the
//      inbox saw a minute ago: a corrected message or a second family member
//      is a new row, cross-referenced with the earlier one on both timelines,
//      and the staff decide whether it is a duplicate.

const SUBMISSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** The website's idempotency key, when the body carried a usable one. */
export function submissionIdOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return SUBMISSION_ID_RE.test(value) ? value : null;
}

/** A digest of the answers as given; the same answers hash the same whatever order the keys arrived in. */
export function fingerprintOf(answers: LeadAnswers): string {
  const canonical = JSON.stringify(
    Object.keys(answers)
      .sort()
      .map((key) => [key, answers[key] ?? null])
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export interface AttemptInput {
  orgId: string;
  ip: string | null;
  submissionId: string | null;
  outcome: LeadSubmissionOutcome;
  leadId?: string | null;
}

/** One line in the limiter's ledger. */
export async function recordAttempt(db: DbOrTx, input: AttemptInput): Promise<void> {
  await db.insert(leadSubmissionAttemptsTable).values({
    orgId: input.orgId,
    ip: input.ip,
    submissionId: input.submissionId,
    outcome: input.outcome,
    leadId: input.leadId ?? null,
  });
}

/** Attempts from one address inside the window — what the limiter compares against. */
export async function countRecentAttempts(db: DbOrTx, orgId: string, ip: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(leadSubmissionAttemptsTable)
    .where(
      and(eq(leadSubmissionAttemptsTable.orgId, orgId), eq(leadSubmissionAttemptsTable.ip, ip), gte(leadSubmissionAttemptsTable.createdAt, since))
    );
  return Number(row?.n ?? 0);
}

export interface WebsiteSubmissionInput {
  orgId: string;
  ip: string | null;
  /** Attempts one address may make inside the window before a cool-down. */
  maxAttemptsPerIp: number;
  windowMs: number;
  /** The website's key for this filled-in form, or null when it sent none. */
  submissionId: string | null;
  questions: readonly LeadFormQuestionRow[];
  body: Record<string, unknown>;
  sourcePage: string | null;
  now?: Date;
}

export type WebsiteSubmissionResult =
  | { outcome: "rate_limited"; retryAfterSeconds: number }
  | { outcome: "invalid"; error: HttpError }
  | { outcome: "retry"; lead: LeadRow; matchedBy: "submission_id" | "answers" }
  | { outcome: "created"; lead: LeadRow; earlierLeadId: string | null };

const RETRY_DETAILS = (matchedBy: "submission_id" | "answers") => ({ source: "website", duplicate: true, matchedBy });

/** Decide what a website submission is and store accordingly — see the notes above. */
export async function acceptWebsiteSubmission(db: Db, input: WebsiteSubmissionInput): Promise<WebsiteSubmissionResult> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.windowMs);

  return db.transaction(async (tx): Promise<WebsiteSubmissionResult> => {
    const attempt = (outcome: LeadSubmissionOutcome, leadId: string | null = null) =>
      recordAttempt(tx, { orgId: input.orgId, ip: input.ip, submissionId: input.submissionId, outcome, leadId });

    // One address at a time, for the rest of this transaction. The key is
    // transaction-scoped, so a failure releases it with the rollback.
    if (input.ip) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('leads.submit'), hashtext(${`${input.orgId}|${input.ip}`}))`);
      if ((await countRecentAttempts(tx, input.orgId, input.ip, since)) >= input.maxAttemptsPerIp) {
        await attempt("rate_limited");
        return { outcome: "rate_limited", retryAfterSeconds: Math.ceil(input.windowMs / 1000) };
      }
    }

    let parsed: ParsedSubmission;
    try {
      parsed = parseSubmission(input.questions, input.body);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      await attempt("invalid");
      return { outcome: "invalid", error: e };
    }
    const fingerprint = fingerprintOf(parsed.answers);

    // A retry of something already stored?
    const recent = parsed.email ? await listRecentByEmail(tx, input.orgId, parsed.email, since) : [];
    let existing = input.submissionId ? await findBySubmissionId(tx, input.orgId, input.submissionId) : undefined;
    let matchedBy: "submission_id" | "answers" = "submission_id";
    if (!existing) {
      existing = recent.find((l) => l.submissionFingerprint === fingerprint);
      matchedBy = "answers";
    }
    if (existing) {
      await addActivity(tx, { leadId: existing.id, type: "submitted", details: RETRY_DETAILS(matchedBy), actorUserId: null });
      await attempt("retry", existing.id);
      return { outcome: "retry", lead: existing, matchedBy };
    }

    // A new inquiry. The partial unique index on (org, submission key) is the
    // last word on retries that arrive at the same instant from different
    // addresses: the second insert waits for the first to commit and then
    // finds nothing to insert.
    const stage = await firstOpenStage(tx, input.orgId);
    const earlier = recent[0] ?? null;
    const [created] = await tx
      .insert(leadsTable)
      .values({
        orgId: input.orgId,
        stageId: stage.id,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        phone: parsed.phone,
        answers: parsed.answers,
        questionSnapshot: snapshotOf(input.questions),
        source: "website",
        sourcePage: input.sourcePage,
        consentAt: parsed.consent ? now : null,
        ip: input.ip,
        submissionId: input.submissionId,
        submissionFingerprint: fingerprint,
        submittedAt: now,
        lastActivityAt: now,
      })
      .onConflictDoNothing({ target: [leadsTable.orgId, leadsTable.submissionId], where: sql`${leadsTable.submissionId} is not null` })
      .returning();
    if (!created) {
      const winner = input.submissionId ? await findBySubmissionId(tx, input.orgId, input.submissionId) : undefined;
      if (!winner) throw new Error("Lead insert returned nothing without a submission key to explain it");
      await addActivity(tx, { leadId: winner.id, type: "submitted", details: RETRY_DETAILS("submission_id"), actorUserId: null });
      await attempt("retry", winner.id);
      return { outcome: "retry", lead: winner, matchedBy: "submission_id" };
    }

    await tx.insert(leadActivitiesTable).values({
      leadId: created.id,
      type: "submitted",
      details: { source: "website", ...(earlier ? { earlierLeadId: earlier.id } : {}) },
      actorUserId: null,
    });
    if (earlier) {
      // The earlier inquiry learns that something different arrived from the
      // same email, so whoever is working it looks at both.
      await addActivity(tx, { leadId: earlier.id, type: "submitted", details: { source: "website", resubmittedAs: created.id }, actorUserId: null });
    }
    await attempt("created", created.id);
    return { outcome: "created", lead: created, earlierLeadId: earlier?.id ?? null };
  });
}

export interface CreateLeadInput {
  orgId: string;
  stageId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  answers: LeadAnswers;
  questionSnapshot: LeadQuestionSnapshot[];
  source: LeadSource;
  sourcePage: string | null;
  consentAt: Date | null;
  ip: string | null;
  /** Null for a website submission; the signed-in user for a manual one. */
  actorUserId: string | null;
  /** An opening note on a manual lead ("called the office at 3pm"). */
  note?: string | null;
}

/** The lead row and its first timeline entry, together or not at all. */
export async function createLead(db: Db, input: CreateLeadInput): Promise<LeadRow> {
  return db.transaction(async (tx) => {
    const [lead] = await tx
      .insert(leadsTable)
      .values({
        orgId: input.orgId,
        stageId: input.stageId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        answers: input.answers,
        questionSnapshot: input.questionSnapshot,
        source: input.source,
        sourcePage: input.sourcePage,
        consentAt: input.consentAt,
        ip: input.ip,
      })
      .returning();
    await tx.insert(leadActivitiesTable).values({
      leadId: lead!.id,
      type: "submitted",
      details: { source: input.source },
      actorUserId: input.actorUserId,
    });
    if (input.note) {
      await tx.insert(leadActivitiesTable).values({ leadId: lead!.id, type: "note", note: input.note, actorUserId: input.actorUserId });
    }
    return lead!;
  });
}

export interface ActivityInput {
  leadId: string;
  type: LeadActivityType;
  note?: string | null;
  /** Identifiers only — never a person's details. */
  details?: Record<string, unknown> | null;
  actorUserId: string | null;
}

/** Append to the timeline and mark the lead as touched. */
export async function addActivity(db: DbOrTx, input: ActivityInput): Promise<LeadActivityRow> {
  const [row] = await db
    .insert(leadActivitiesTable)
    .values({
      leadId: input.leadId,
      type: input.type,
      note: input.note ?? null,
      details: input.details ?? null,
      actorUserId: input.actorUserId,
    })
    .returning();
  await db.update(leadsTable).set({ lastActivityAt: new Date(), updatedAt: new Date() }).where(eq(leadsTable.id, input.leadId));
  return row!;
}

export async function listActivities(db: DbOrTx, leadId: string): Promise<LeadActivityRow[]> {
  return db
    .select()
    .from(leadActivitiesTable)
    .where(eq(leadActivitiesTable.leadId, leadId))
    .orderBy(desc(leadActivitiesTable.createdAt), desc(leadActivitiesTable.id));
}

// ── the legacy import ───────────────────────────────────────────────────────

/** The `import_source` value on a lead that came from the storage-only endpoint's table. */
export const CONSULTATION_IMPORT_SOURCE = "consultation_requests";

export async function countConsultationRequests(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(consultationRequests);
  return Number(row?.n ?? 0);
}

export interface ConsultationImportTarget {
  orgId: string;
  slug: string;
  /** Why this organization: the operator named it, or it is the only one there is. */
  basis: "configured" | "sole_organization";
}

export type ConsultationImportDecision = { ok: true; target: ConsultationImportTarget } | { ok: false; reason: string };

/**
 * Which organization the stored consultation requests belong to.
 *
 * The table carries no organization: the storage-only endpoint predates
 * multi-tenancy, so its rows can only be attributed by inference. Filing them
 * under the default organization is a safe inference exactly when it is the
 * only organization. Once there are two, a guess would put one agency's
 * inquiries in another agency's inbox, so the operator has to say which
 * (CONSULTATION_IMPORT_ORG_SLUG) and the rows wait until they do.
 */
export async function resolveConsultationImportOrg(
  db: Db,
  config: Pick<AppConfig, "defaultOrgSlug" | "consultationImportOrgSlug">
): Promise<ConsultationImportDecision> {
  const orgs = await db
    .select({ id: organizationsTable.id, slug: organizationsTable.slug, status: organizationsTable.status })
    .from(organizationsTable);
  if (config.consultationImportOrgSlug) {
    const named = orgs.find((o) => o.slug === config.consultationImportOrgSlug);
    if (!named) return { ok: false, reason: `CONSULTATION_IMPORT_ORG_SLUG names "${config.consultationImportOrgSlug}", which does not exist` };
    if (named.status !== "active") return { ok: false, reason: `CONSULTATION_IMPORT_ORG_SLUG names "${named.slug}", which is ${named.status}` };
    return { ok: true, target: { orgId: named.id, slug: named.slug, basis: "configured" } };
  }
  if (orgs.length !== 1) {
    return { ok: false, reason: `${orgs.length} organizations exist; set CONSULTATION_IMPORT_ORG_SLUG to say which one the rows belong to` };
  }
  const only = orgs[0]!;
  if (only.slug !== config.defaultOrgSlug) {
    return { ok: false, reason: `the only organization ("${only.slug}") is not the default ("${config.defaultOrgSlug}"); set CONSULTATION_IMPORT_ORG_SLUG` };
  }
  if (only.status !== "active") return { ok: false, reason: `the default organization is ${only.status}` };
  return { ok: true, target: { orgId: only.id, slug: only.slug, basis: "sole_organization" } };
}

export interface ConsultationImportOptions {
  /** Recorded on each import's audit entry: how the organization was chosen. */
  attribution?: ConsultationImportTarget["basis"] | "explicit";
}

/**
 * Bring in anything the earlier storage-only endpoint (`/api/consultation-requests`,
 * PR 26) saved before the inbox existed. Each row becomes a website inquiry dated
 * when it arrived, in the organization's first open stage, and is deleted once it
 * is in. Safe to run on every boot: an empty table is a no-op.
 *
 * Safe to run from several boots at once, too. Each row is claimed with a row
 * lock in its own transaction, so a second process importing the same table
 * waits for the first to finish with a row and then finds it gone. Should a
 * row ever be read again after it was imported, the lead carries the source
 * row's id (`import_source`, `import_source_id`, unique), so the second insert
 * does nothing and the source row is simply removed. Either way: one lead per
 * stored request, however many processes start.
 *
 * Returns how many leads this call created.
 */
export async function importConsultationRequests(db: Db, orgId: string, opts: ConsultationImportOptions = {}): Promise<number> {
  const pending = await db.select({ id: consultationRequests.id }).from(consultationRequests).orderBy(asc(consultationRequests.createdAt));
  if (pending.length === 0) return 0;
  const [stage, questions] = await Promise.all([firstOpenStage(db, orgId), listQuestions(db, orgId)]);
  const questionSnapshot = snapshotOf(questions);
  const attribution = opts.attribution ?? "explicit";
  let imported = 0;
  for (const { id } of pending) {
    const lead = await db.transaction(async (tx) => {
      // Claim the row. Another process that got here first has deleted it by
      // the time the lock is granted, and the select then returns nothing.
      const [row] = await tx.select().from(consultationRequests).where(eq(consultationRequests.id, id)).limit(1).for("update");
      if (!row) return null;
      const email = row.email.trim().toLowerCase() || null;
      const phone = row.phone.trim() || null;
      const consented = row.consent === "yes";
      const [created] = await tx
        .insert(leadsTable)
        .values({
          orgId,
          stageId: stage.id,
          firstName: row.firstName,
          lastName: row.lastName,
          email,
          phone,
          answers: {
            firstName: row.firstName,
            lastName: row.lastName,
            email,
            phone,
            role: row.role || null,
            service: row.service || null,
            message: row.message || null,
            consent: consented,
          },
          questionSnapshot,
          source: "website",
          sourcePage: "/contact.html",
          consentAt: consented ? row.createdAt : null,
          ip: null,
          importSource: CONSULTATION_IMPORT_SOURCE,
          importSourceId: row.id,
          submittedAt: row.createdAt,
          lastActivityAt: row.createdAt,
        })
        .onConflictDoNothing({ target: [leadsTable.importSource, leadsTable.importSourceId], where: sql`${leadsTable.importSource} is not null` })
        .returning();
      if (created) {
        await tx.insert(leadActivitiesTable).values({
          leadId: created.id,
          type: "submitted",
          details: { source: "website", importedFrom: CONSULTATION_IMPORT_SOURCE, sourceId: row.id },
          actorUserId: null,
          createdAt: row.createdAt,
        });
      }
      // Imported now, or already imported earlier: the source row is done either way.
      await tx.delete(consultationRequests).where(eq(consultationRequests.id, row.id));
      return created ?? null;
    });
    if (!lead) continue;
    await recordAudit(db, {
      orgId,
      actorUserId: null,
      action: "lead.imported",
      targetType: "lead",
      targetId: lead.id,
      details: { from: CONSULTATION_IMPORT_SOURCE, sourceId: lead.importSourceId, receivedAt: lead.submittedAt.toISOString(), attribution },
    });
    imported += 1;
  }
  return imported;
}

/** Null the submitting address once it is older than the retention period. */
export async function scrubLeadIps(db: Db, retentionDays: number, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const rows = await db
    .update(leadsTable)
    .set({ ip: null })
    .where(and(isNotNull(leadsTable.ip), lt(leadsTable.createdAt, cutoff)))
    .returning({ id: leadsTable.id });
  return rows.length;
}

/** Remove attempt rows older than the retention period; the limiter only ever looks inside its window. */
export async function pruneSubmissionAttempts(db: Db, retentionDays: number, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const rows = await db
    .delete(leadSubmissionAttemptsTable)
    .where(lt(leadSubmissionAttemptsTable.createdAt, cutoff))
    .returning({ id: leadSubmissionAttemptsTable.id });
  return rows.length;
}

// ── wire shapes ─────────────────────────────────────────────────────────────

export interface StageJson {
  id: string;
  key: string;
  label: string;
  kind: LeadStageKind;
  sortOrder: number;
  isSystem: boolean;
  active: boolean;
}

export function toStageJson(s: LeadStageRow): StageJson {
  return { id: s.id, key: s.key, label: s.label, kind: s.kind, sortOrder: s.sortOrder, isSystem: s.isSystem, active: s.active };
}

export interface QuestionJson extends PublicQuestion {
  id: string;
  isSystem: boolean;
  sortOrder: number;
  active: boolean;
}

export function toQuestionJson(q: LeadFormQuestionRow): QuestionJson {
  return { ...toPublicQuestion(q), id: q.id, isSystem: q.isSystem, sortOrder: q.sortOrder, active: q.active };
}

export interface LeadJson {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  stageId: string;
  source: LeadSource;
  sourcePage: string | null;
  consentAt: string | null;
  assignedToUserId: string | null;
  closedReason: LeadRow["closedReason"];
  convertedClientId: string | null;
  /** Set on a lead brought in from the earlier storage-only endpoint's table. */
  importSource: string | null;
  submittedAt: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  answers: LeadAnswers;
  questionSnapshot: LeadQuestionSnapshot[];
}

export function toLeadJson(l: LeadRow): LeadJson {
  return {
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    email: l.email,
    phone: l.phone,
    stageId: l.stageId,
    source: l.source,
    sourcePage: l.sourcePage,
    consentAt: l.consentAt ? l.consentAt.toISOString() : null,
    assignedToUserId: l.assignedToUserId,
    closedReason: l.closedReason,
    convertedClientId: l.convertedClientId,
    importSource: l.importSource,
    submittedAt: l.submittedAt.toISOString(),
    lastActivityAt: l.lastActivityAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    answers: l.answers,
    questionSnapshot: l.questionSnapshot,
  };
}

export interface ActivityJson {
  id: string;
  type: LeadActivityType;
  note: string | null;
  details: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
}

export function toActivityJson(a: LeadActivityRow): ActivityJson {
  return { id: a.id, type: a.type, note: a.note, details: a.details, actorUserId: a.actorUserId, createdAt: a.createdAt.toISOString() };
}
