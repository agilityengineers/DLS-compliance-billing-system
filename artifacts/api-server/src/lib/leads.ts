// artifacts/api-server/src/lib/leads.ts — what the public form and the inbox
// share: resolving which organization a website submission belongs to,
// validating answers against the organization's own question list, the
// funnel's structural stages, and the writes that keep a lead's timeline in
// step with its row.
import { and, asc, count, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import {
  consultationRequests,
  leadActivitiesTable,
  leadFormQuestionsTable,
  leadStagesTable,
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

/** Submissions from one address inside the window — the public limiter's state. */
export async function countRecentSubmissions(db: Db, orgId: string, ip: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.ip, ip), gte(leadsTable.createdAt, since)));
  return Number(row?.n ?? 0);
}

/** A lead this address already created inside the window, if any (a double-click, a refresh). */
export async function findRecentByEmail(db: Db, orgId: string, email: string, since: Date): Promise<LeadRow | undefined> {
  const rows = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.email, email), gte(leadsTable.createdAt, since)))
    .orderBy(desc(leadsTable.createdAt))
    .limit(1);
  return rows[0];
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

/**
 * Bring in anything the earlier storage-only endpoint (`/api/consultation-requests`,
 * PR 26) saved before the inbox existed. Each row becomes a website inquiry dated
 * when it arrived, in the organization's first open stage, and is deleted once it
 * is in. Safe to run on every boot: an empty table is a no-op.
 */
export async function importConsultationRequests(db: Db, orgId: string): Promise<number> {
  const rows = await db.select().from(consultationRequests).orderBy(asc(consultationRequests.createdAt));
  if (rows.length === 0) return 0;
  const [stage, questions] = await Promise.all([firstOpenStage(db, orgId), listQuestions(db, orgId)]);
  const questionSnapshot = snapshotOf(questions);
  let imported = 0;
  for (const row of rows) {
    const email = row.email.trim().toLowerCase() || null;
    const phone = row.phone.trim() || null;
    const consented = row.consent === "yes";
    const lead = await db.transaction(async (tx) => {
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
          submittedAt: row.createdAt,
          lastActivityAt: row.createdAt,
        })
        .returning();
      await tx.insert(leadActivitiesTable).values({
        leadId: created!.id,
        type: "submitted",
        details: { source: "website", importedFrom: "consultation_requests" },
        actorUserId: null,
        createdAt: row.createdAt,
      });
      await tx.delete(consultationRequests).where(eq(consultationRequests.id, row.id));
      return created!;
    });
    await recordAudit(db, {
      orgId,
      actorUserId: null,
      action: "lead.imported",
      targetType: "lead",
      targetId: lead.id,
      details: { from: "consultation_requests", receivedAt: row.createdAt.toISOString() },
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
