// The inbox: every inquiry the organization has received, the funnel it moves
// through, who is working it, and what has happened to it.
//
// Gated on the `leads.inbox` feature — the first route family to use
// requireFeature — so an Admin always has it when the switch is on and a
// Scheduler has it only when the Admin granted the role. Everything is scoped
// to the caller's organization; nothing here can see another organization's
// inquiries, and a provider account acting as itself has no organization and
// is refused.
import { Router, type IRouter } from "express";
import { and, count, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import {
  LEAD_CLOSED_REASONS,
  LEAD_QUESTION_TYPES,
  clientsTable,
  leadActivitiesTable,
  leadFormQuestionsTable,
  leadStagesTable,
  leadsTable,
  usersTable,
  type Db,
  type LeadFormQuestionRow,
  type LeadRow,
  type LeadStageRow,
} from "@workspace/db";
import { recordAudit, type AuditEntry } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { badRequest, conflict, notFound } from "../lib/errors";
import {
  addActivity,
  createLead,
  findLead,
  findStage,
  firstOpenStage,
  listActivities,
  listQuestions,
  listStages,
  snapshotOf,
  toActivityJson,
  toLeadJson,
  toQuestionJson,
  toStageJson,
  type ActivityJson,
  type LeadJson,
  type StageJson,
} from "../lib/leads";
import { leadAssignedEmail, type Mailer } from "../lib/mail";
import { findActiveOrgUser, listOrgUsers, type PublicUser } from "../lib/users";
import { requireAuth, requireAuthContext, requireFeature, requireOrgId, requireRole, type AuthContext } from "../middlewares/auth";

const ASSIGNABLE_ROLES = new Set(["Admin", "Scheduler"]);

const ListQuery = z.object({
  /** A stage id, or "all". */
  stage: z.string().trim().max(60).optional(),
  /** "me", "unassigned" or a user id. */
  assignee: z.string().trim().max(60).optional(),
  q: z.string().trim().max(100).optional(),
  /** 0 returns the counts only. */
  limit: z.coerce.number().int().min(0).max(500).catch(100),
});

const CreateBody = z.object({
  firstName: z.string().trim().min(1).max(200),
  lastName: z.string().trim().min(1).max(200),
  email: z.union([z.literal(""), z.email().max(254)]).optional(),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(4000).optional(),
});

const PatchBody = z.object({
  stageId: z.uuid().optional(),
  closedReason: z.enum(LEAD_CLOSED_REASONS).nullable().optional(),
  assignedToUserId: z.uuid().nullable().optional(),
});

const NoteBody = z.object({ note: z.string().trim().min(1).max(4000) });

// ── the form and the funnel (Admin only) ──────────────────────────────────
const FORM_LIMITS = { activeQuestions: 25, options: 20, activeStages: 15 } as const;

const OptionList = z.array(z.string().trim().min(1).max(100)).max(FORM_LIMITS.options);

const QuestionCreate = z.object({
  label: z.string().trim().min(1).max(200),
  helpText: z.string().trim().max(300).optional(),
  type: z.enum(LEAD_QUESTION_TYPES),
  options: OptionList.optional(),
  required: z.boolean().optional(),
});

const QuestionPatch = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  helpText: z.string().trim().max(300).nullable().optional(),
  options: OptionList.optional(),
  required: z.boolean().optional(),
  active: z.boolean().optional(),
});

const StageCreate = z.object({ label: z.string().trim().min(1).max(80) });
const StagePatch = z.object({ label: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional() });
const OrderBody = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

/** A stable key from a label: "How did you hear about us?" → "how_did_you_hear_about_us". */
function slugify(label: string, fallback: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return key || fallback;
}

/** `base`, or `base_2`, `base_3`… when the organization already uses it. */
function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

function dedupeOptions(options: string[] | undefined): string[] {
  return Array.from(new Set((options ?? []).map((o) => o.trim()).filter(Boolean)));
}

export interface LeadListItem extends LeadJson {
  assignedToName: string | null;
}

export interface LeadDetail extends LeadListItem {
  stage: StageJson | null;
  convertedClient: { id: string; firstName: string; lastName: string } | null;
}

export interface ActivityDetail extends ActivityJson {
  actorName: string | null;
}

export interface AssigneeJson {
  id: string;
  fullName: string;
  role: string;
}

const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function leadsRouter(db: Db, _config: AppConfig, deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();
  router.use("/leads", requireAuth, requireFeature("leads.inbox"));

  function auditBase(auth: AuthContext, orgId: string, ip: string | null | undefined): Pick<AuditEntry, "orgId" | "actorUserId" | "impersonatingUserId" | "ip"> {
    return {
      orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      ip: ip ?? null,
    };
  }

  /** Who an inquiry can be handed to: active Admins and Schedulers. */
  function assigneesOf(users: PublicUser[]): AssigneeJson[] {
    return users
      .filter((u) => u.status === "Active" && ASSIGNABLE_ROLES.has(u.role))
      .map((u) => ({ id: u.id, fullName: u.fullName, role: u.role }));
  }

  async function loadDetail(orgId: string, lead: LeadRow, users: PublicUser[]): Promise<{ lead: LeadDetail; activities: ActivityDetail[] }> {
    const nameOf = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? null;
    const [stage, activities, converted] = await Promise.all([
      findStage(db, orgId, lead.stageId),
      listActivities(db, lead.id),
      lead.convertedClientId
        ? db
            .select({ id: clientsTable.id, firstName: clientsTable.firstName, lastName: clientsTable.lastName })
            .from(clientsTable)
            .where(and(eq(clientsTable.orgId, orgId), eq(clientsTable.id, lead.convertedClientId)))
            .limit(1)
            .then((r) => r[0] ?? null)
        : Promise.resolve(null),
    ]);
    return {
      lead: {
        ...toLeadJson(lead),
        assignedToName: nameOf(lead.assignedToUserId),
        stage: stage ? toStageJson(stage) : null,
        convertedClient: converted,
      },
      activities: activities.map((a) => ({ ...toActivityJson(a), actorName: nameOf(a.actorUserId) })),
    };
  }

  async function leadOr404(orgId: string, id: string): Promise<LeadRow> {
    const lead = isUuid(id) ? await findLead(db, orgId, id) : undefined;
    if (!lead) throw notFound("Inquiry not found.");
    return lead;
  }

  // ── the inbox ─────────────────────────────────────────────────────────
  router.get("/leads", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const q = ListQuery.parse(req.query);

    const conditions: SQL[] = [eq(leadsTable.orgId, orgId)];
    if (q.stage && q.stage !== "all") {
      if (!isUuid(q.stage)) throw badRequest("Unknown stage.");
      conditions.push(eq(leadsTable.stageId, q.stage));
    }
    if (q.assignee === "me") conditions.push(eq(leadsTable.assignedToUserId, auth.effectiveUser.id));
    else if (q.assignee === "unassigned") conditions.push(isNull(leadsTable.assignedToUserId));
    else if (q.assignee) {
      if (!isUuid(q.assignee)) throw badRequest("Unknown assignee.");
      conditions.push(eq(leadsTable.assignedToUserId, q.assignee));
    }
    if (q.q) {
      const term = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(
        or(
          sql`${leadsTable.firstName} ilike ${term}`,
          sql`${leadsTable.lastName} ilike ${term}`,
          sql`(${leadsTable.firstName} || ' ' || ${leadsTable.lastName}) ilike ${term}`,
          sql`${leadsTable.email} ilike ${term}`
        )!
      );
    }

    const [stages, users, byStage, unassignedRow, rows] = await Promise.all([
      listStages(db, orgId, { includeInactive: true }),
      listOrgUsers(db, orgId),
      db.select({ stageId: leadsTable.stageId, n: count() }).from(leadsTable).where(eq(leadsTable.orgId, orgId)).groupBy(leadsTable.stageId),
      db
        .select({ n: count() })
        .from(leadsTable)
        .innerJoin(leadStagesTable, eq(leadStagesTable.id, leadsTable.stageId))
        .where(and(eq(leadsTable.orgId, orgId), isNull(leadsTable.assignedToUserId), eq(leadStagesTable.kind, "open"))),
      q.limit === 0
        ? Promise.resolve([] as { lead: LeadRow; assigneeName: string | null }[])
        : db
            .select({ lead: leadsTable, assigneeName: usersTable.fullName })
            .from(leadsTable)
            .leftJoin(usersTable, eq(usersTable.id, leadsTable.assignedToUserId))
            .where(and(...conditions))
            .orderBy(desc(leadsTable.lastActivityAt), desc(leadsTable.createdAt))
            .limit(q.limit),
    ]);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of byStage) {
      counts[row.stageId] = Number(row.n);
      total += Number(row.n);
    }
    res.json({
      leads: rows.map<LeadListItem>((r) => ({ ...toLeadJson(r.lead), assignedToName: r.assigneeName })),
      stages: stages.map(toStageJson),
      counts: { byStage: counts, total, unassigned: Number(unassignedRow[0]?.n ?? 0) },
      assignees: assigneesOf(users),
    });
  });

  /** An inquiry that came in by phone or in person. */
  router.post("/leads", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = CreateBody.parse(req.body);
    const email = body.email ? body.email.toLowerCase() : null;
    const phone = body.phone || null;
    const [stage, questions] = await Promise.all([firstOpenStage(db, orgId), listQuestions(db, orgId)]);
    const identity = questions.filter((q) => ["firstName", "lastName", "email", "phone"].includes(q.key));
    const lead = await createLead(db, {
      orgId,
      stageId: stage.id,
      firstName: body.firstName,
      lastName: body.lastName,
      email,
      phone,
      answers: { firstName: body.firstName, lastName: body.lastName, email, phone },
      questionSnapshot: snapshotOf(identity),
      source: "manual",
      sourcePage: null,
      consentAt: null,
      ip: null,
      actorUserId: auth.realUser.id,
      note: body.note || null,
    });
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead.created",
      targetType: "lead",
      targetId: lead.id,
      details: { source: "manual" },
    });
    const users = await listOrgUsers(db, orgId);
    res.status(201).json(await loadDetail(orgId, lead, users));
  });

  router.get("/leads/:id", async (req, res) => {
    const orgId = requireOrgId(res);
    const lead = await leadOr404(orgId, String(req.params.id));
    const users = await listOrgUsers(db, orgId);
    res.json({ ...(await loadDetail(orgId, lead, users)), assignees: assigneesOf(users) });
  });

  /** Move it along the funnel, hand it to someone, or both. */
  router.patch("/leads/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = PatchBody.parse(req.body);
    const lead = await leadOr404(orgId, String(req.params.id));
    const currentStage = await findStage(db, orgId, lead.stageId);
    if (currentStage?.kind === "won" || lead.convertedClientId) {
      throw conflict("LEAD_CONVERTED", "This inquiry has already become a client and can no longer be changed.");
    }

    const now = new Date();
    const set: Partial<typeof leadsTable.$inferInsert> = {};
    const activities: Omit<Parameters<typeof addActivity>[1], "leadId" | "actorUserId">[] = [];
    const audits: Omit<AuditEntry, "orgId" | "actorUserId" | "impersonatingUserId" | "ip">[] = [];
    let newAssignee: { id: string; email: string; fullName: string } | null = null;
    let targetStage: LeadStageRow | undefined;

    if (body.stageId !== undefined && body.stageId !== lead.stageId) {
      targetStage = await findStage(db, orgId, body.stageId);
      if (!targetStage || !targetStage.active) throw badRequest("That stage does not exist.");
      if (targetStage.kind === "won") {
        throw conflict("USE_CONVERSION", "To mark an inquiry as converted, create the client from it.");
      }
      if (targetStage.kind === "lost") {
        const reason = body.closedReason ?? lead.closedReason;
        if (!reason) throw badRequest("Give a reason for closing this inquiry.");
        set.closedReason = reason;
      } else {
        set.closedReason = null;
      }
      set.stageId = targetStage.id;
      activities.push({
        type: "stage_changed",
        details: { from: lead.stageId, to: targetStage.id, fromKey: currentStage?.key ?? null, toKey: targetStage.key, closedReason: set.closedReason ?? null },
      });
      audits.push({
        action: "lead.stage_changed",
        targetType: "lead",
        targetId: lead.id,
        details: { from: currentStage?.key ?? null, to: targetStage.key, closedReason: set.closedReason ?? null },
      });
    } else if (body.closedReason !== undefined && currentStage?.kind === "lost" && body.closedReason !== lead.closedReason) {
      if (!body.closedReason) throw badRequest("A closed inquiry keeps a reason.");
      set.closedReason = body.closedReason;
      audits.push({ action: "lead.stage_changed", targetType: "lead", targetId: lead.id, details: { from: currentStage.key, to: currentStage.key, closedReason: body.closedReason } });
    }

    if (body.assignedToUserId !== undefined && body.assignedToUserId !== lead.assignedToUserId) {
      if (body.assignedToUserId) {
        const user = await findActiveOrgUser(db, orgId, body.assignedToUserId);
        if (!user || !ASSIGNABLE_ROLES.has(user.role)) throw badRequest("Choose an active Admin or Scheduler in your organization.");
        set.assignedToUserId = user.id;
        newAssignee = { id: user.id, email: user.email, fullName: user.fullName };
      } else {
        set.assignedToUserId = null;
      }
      activities.push({ type: "assigned", details: { from: lead.assignedToUserId, to: set.assignedToUserId ?? null } });
      audits.push({ action: "lead.assigned", targetType: "lead", targetId: lead.id, details: { from: lead.assignedToUserId, to: set.assignedToUserId ?? null } });
    }

    const users = await listOrgUsers(db, orgId);
    if (Object.keys(set).length === 0) {
      res.json({ ...(await loadDetail(orgId, lead, users)), assignees: assigneesOf(users) });
      return;
    }

    const { updated, assignedActivityId } = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(leadsTable)
        .set({ ...set, lastActivityAt: now, updatedAt: now })
        .where(eq(leadsTable.id, lead.id))
        .returning();
      let assignedActivityId: string | null = null;
      for (const a of activities) {
        const [inserted] = await tx
          .insert(leadActivitiesTable)
          .values({ leadId: lead.id, type: a.type, note: a.note ?? null, details: a.details ?? null, actorUserId: auth.realUser.id })
          .returning({ id: leadActivitiesTable.id });
        if (a.type === "assigned") assignedActivityId = inserted!.id;
      }
      return { updated: row!, assignedActivityId };
    });
    for (const a of audits) await recordAudit(db, { ...auditBase(auth, orgId, req.ip), ...a });

    // Tell the new assignee, unless they did it themselves. Keyed on the
    // timeline entry, so one hand-over is one email however often it is retried.
    if (newAssignee && newAssignee.id !== auth.effectiveUser.id && assignedActivityId) {
      void deps.mailer
        .send(
          leadAssignedEmail({
            fullName: newAssignee.fullName,
            assignedBy: auth.effectiveUser.fullName,
            orgName: auth.org?.name ?? "your organization",
            link: deps.mailer.link(`/admin/leads/${lead.id}`),
          }),
          { to: newAssignee.email, userId: newAssignee.id, orgId, dedupeKey: `lead_assigned:${assignedActivityId}` }
        )
        .catch(() => undefined);
    }

    res.json({ ...(await loadDetail(orgId, updated, users)), assignees: assigneesOf(users) });
  });

  // ── configuration: the website form and the funnel ───────────────────
  // Admin only, and registered before the `/leads/:id` family so that
  // "config" is never read as an inquiry id.
  router.use("/leads/config", requireRole("Admin"));

  async function questionOr404(orgId: string, id: string): Promise<LeadFormQuestionRow> {
    const rows = isUuid(id)
      ? await db
          .select()
          .from(leadFormQuestionsTable)
          .where(and(eq(leadFormQuestionsTable.orgId, orgId), eq(leadFormQuestionsTable.id, id)))
          .limit(1)
      : [];
    if (!rows[0]) throw notFound("Question not found.");
    return rows[0];
  }

  async function activeQuestionCount(orgId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(leadFormQuestionsTable)
      .where(and(eq(leadFormQuestionsTable.orgId, orgId), eq(leadFormQuestionsTable.active, true)));
    return Number(row?.n ?? 0);
  }

  router.get("/leads/config/questions", async (_req, res) => {
    const orgId = requireOrgId(res);
    const questions = await listQuestions(db, orgId, { includeInactive: true });
    res.json({ questions: questions.map(toQuestionJson), limits: FORM_LIMITS });
  });

  router.post("/leads/config/questions", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = QuestionCreate.parse(req.body);
    const options = body.type === "select" ? dedupeOptions(body.options) : [];
    if (body.type === "select" && options.length < 2) throw badRequest("A choice question needs at least two options.");
    if ((await activeQuestionCount(orgId)) >= FORM_LIMITS.activeQuestions) {
      throw conflict("TOO_MANY_QUESTIONS", `The form can have at most ${FORM_LIMITS.activeQuestions} questions. Retire one first.`);
    }
    const existing = await listQuestions(db, orgId, { includeInactive: true });
    const key = uniqueKey(slugify(body.label, "question"), new Set(existing.map((q) => q.key)));
    const sortOrder = existing.reduce((m, q) => Math.max(m, q.sortOrder), 0) + 10;
    const [created] = await db
      .insert(leadFormQuestionsTable)
      .values({
        orgId,
        key,
        label: body.label,
        helpText: body.helpText || null,
        type: body.type,
        options,
        required: body.required ?? false,
        sortOrder,
      })
      .returning();
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_form.question_created",
      targetType: "lead_form_question",
      targetId: created!.id,
      details: { key, type: body.type, required: body.required ?? false },
    });
    res.status(201).json({ question: toQuestionJson(created!) });
  });

  router.patch("/leads/config/questions/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = QuestionPatch.parse(req.body);
    const question = await questionOr404(orgId, String(req.params.id));
    const set: Partial<typeof leadFormQuestionsTable.$inferInsert> = {};
    if (body.label !== undefined) set.label = body.label;
    if (body.helpText !== undefined) set.helpText = body.helpText || null;
    if (question.isSystem) {
      // Identity and consent questions keep their shape: the inbox and the
      // conversion flow read them by key and type.
      if (body.required !== undefined || body.active !== undefined || body.options !== undefined) {
        throw conflict("SYSTEM_QUESTION", "This question is part of how the inbox works; you can change its wording but not remove it or make it optional.");
      }
    } else {
      if (body.required !== undefined) set.required = body.required;
      if (body.options !== undefined) {
        if (question.type !== "select") throw badRequest("Only a choice question has options.");
        const options = dedupeOptions(body.options);
        if (options.length < 2) throw badRequest("A choice question needs at least two options.");
        set.options = options;
      }
      if (body.active !== undefined && body.active !== question.active) {
        if (body.active && (await activeQuestionCount(orgId)) >= FORM_LIMITS.activeQuestions) {
          throw conflict("TOO_MANY_QUESTIONS", `The form can have at most ${FORM_LIMITS.activeQuestions} questions. Retire one first.`);
        }
        set.active = body.active;
      }
    }
    if (Object.keys(set).length === 0) {
      res.json({ question: toQuestionJson(question) });
      return;
    }
    const [updated] = await db
      .update(leadFormQuestionsTable)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(leadFormQuestionsTable.id, question.id))
      .returning();
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_form.question_updated",
      targetType: "lead_form_question",
      targetId: question.id,
      details: { key: question.key, fields: Object.keys(set) },
    });
    res.json({ question: toQuestionJson(updated!) });
  });

  /** Retire a question. Old answers keep their wording through the snapshot on each lead. */
  router.delete("/leads/config/questions/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const question = await questionOr404(orgId, String(req.params.id));
    if (question.isSystem) throw conflict("SYSTEM_QUESTION", "This question is part of how the inbox works and cannot be removed.");
    const [updated] = await db
      .update(leadFormQuestionsTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(leadFormQuestionsTable.id, question.id))
      .returning();
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_form.question_removed",
      targetType: "lead_form_question",
      targetId: question.id,
      details: { key: question.key },
    });
    res.json({ ok: true, question: toQuestionJson(updated!) });
  });

  router.put("/leads/config/questions/order", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const { ids } = OrderBody.parse(req.body);
    const existing = await listQuestions(db, orgId, { includeInactive: true });
    const known = new Set(existing.map((q) => q.id));
    if (!ids.every((id) => known.has(id))) throw badRequest("One of those questions is not on this form.");
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(leadFormQuestionsTable)
          .set({ sortOrder: (index + 1) * 10, updatedAt: new Date() })
          .where(eq(leadFormQuestionsTable.id, id));
      }
    });
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_form.reordered",
      targetType: "lead_form",
      targetId: orgId,
      details: { count: ids.length },
    });
    const questions = await listQuestions(db, orgId, { includeInactive: true });
    res.json({ questions: questions.map(toQuestionJson) });
  });

  async function stageOr404(orgId: string, id: string): Promise<LeadStageRow> {
    const stage = isUuid(id) ? await findStage(db, orgId, id) : undefined;
    if (!stage) throw notFound("Stage not found.");
    return stage;
  }

  async function leadCountsByStage(orgId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({ stageId: leadsTable.stageId, n: count() })
      .from(leadsTable)
      .where(eq(leadsTable.orgId, orgId))
      .groupBy(leadsTable.stageId);
    return Object.fromEntries(rows.map((r) => [r.stageId, Number(r.n)]));
  }

  /** Keep sort orders in steps of ten so the next insert always has room. */
  async function renumberStages(orgId: string): Promise<void> {
    const stages = await listStages(db, orgId, { includeInactive: true });
    await db.transaction(async (tx) => {
      for (const [index, stage] of stages.entries()) {
        const wanted = (index + 1) * 10;
        if (stage.sortOrder !== wanted) {
          await tx.update(leadStagesTable).set({ sortOrder: wanted }).where(eq(leadStagesTable.id, stage.id));
        }
      }
    });
  }

  router.get("/leads/config/stages", async (_req, res) => {
    const orgId = requireOrgId(res);
    const [stages, counts] = await Promise.all([listStages(db, orgId, { includeInactive: true }), leadCountsByStage(orgId)]);
    res.json({ stages: stages.map(toStageJson), counts, limits: FORM_LIMITS });
  });

  /** A new open stage, placed just before the "converted" and "closed" stages. */
  router.post("/leads/config/stages", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = StageCreate.parse(req.body);
    const existing = await listStages(db, orgId, { includeInactive: true });
    if (existing.filter((s) => s.active).length >= FORM_LIMITS.activeStages) {
      throw conflict("TOO_MANY_STAGES", `The funnel can have at most ${FORM_LIMITS.activeStages} stages. Retire one first.`);
    }
    const key = uniqueKey(slugify(body.label, "stage"), new Set(existing.map((s) => s.key)));
    const lastOpen = existing.filter((s) => s.kind === "open").reduce((m, s) => Math.max(m, s.sortOrder), 0);
    const [created] = await db
      .insert(leadStagesTable)
      .values({ orgId, key, label: body.label, kind: "open", sortOrder: lastOpen + 1 })
      .returning();
    await renumberStages(orgId);
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_funnel.stage_created",
      targetType: "lead_stage",
      targetId: created!.id,
      details: { key },
    });
    const fresh = await findStage(db, orgId, created!.id);
    res.status(201).json({ stage: toStageJson(fresh ?? created!) });
  });

  router.patch("/leads/config/stages/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = StagePatch.parse(req.body);
    const stage = await stageOr404(orgId, String(req.params.id));
    const set: Partial<typeof leadStagesTable.$inferInsert> = {};
    if (body.label !== undefined) set.label = body.label;
    if (body.active !== undefined && body.active !== stage.active) {
      if (stage.isSystem) throw conflict("SYSTEM_STAGE", "This stage is part of how the funnel works; you can rename it but not retire it.");
      if (!body.active) {
        const inUse = (await leadCountsByStage(orgId))[stage.id] ?? 0;
        if (inUse > 0) throw conflict("STAGE_IN_USE", `${inUse} ${inUse === 1 ? "inquiry is" : "inquiries are"} in this stage. Move them first.`);
      } else if ((await listStages(db, orgId)).length >= FORM_LIMITS.activeStages) {
        throw conflict("TOO_MANY_STAGES", `The funnel can have at most ${FORM_LIMITS.activeStages} stages.`);
      }
      set.active = body.active;
    }
    if (Object.keys(set).length === 0) {
      res.json({ stage: toStageJson(stage) });
      return;
    }
    const [updated] = await db
      .update(leadStagesTable)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(leadStagesTable.id, stage.id))
      .returning();
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_funnel.stage_updated",
      targetType: "lead_stage",
      targetId: stage.id,
      details: { key: stage.key, fields: Object.keys(set) },
    });
    res.json({ stage: toStageJson(updated!) });
  });

  /** Remove a stage nothing refers to. One that holds inquiries is refused with the count. */
  router.delete("/leads/config/stages/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const stage = await stageOr404(orgId, String(req.params.id));
    if (stage.isSystem) throw conflict("SYSTEM_STAGE", "This stage is part of how the funnel works and cannot be removed.");
    const inUse = (await leadCountsByStage(orgId))[stage.id] ?? 0;
    if (inUse > 0) throw conflict("STAGE_IN_USE", `${inUse} ${inUse === 1 ? "inquiry is" : "inquiries are"} in this stage. Move them first.`);
    await db.delete(leadStagesTable).where(eq(leadStagesTable.id, stage.id));
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_funnel.stage_removed",
      targetType: "lead_stage",
      targetId: stage.id,
      details: { key: stage.key },
    });
    res.json({ ok: true });
  });

  router.put("/leads/config/stages/order", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const { ids } = OrderBody.parse(req.body);
    const existing = await listStages(db, orgId, { includeInactive: true });
    const known = new Set(existing.map((s) => s.id));
    if (!ids.every((id) => known.has(id))) throw badRequest("One of those stages is not in this funnel.");
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.update(leadStagesTable).set({ sortOrder: (index + 1) * 10, updatedAt: new Date() }).where(eq(leadStagesTable.id, id));
      }
    });
    await renumberStages(orgId);
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead_funnel.reordered",
      targetType: "lead_funnel",
      targetId: orgId,
      details: { count: ids.length },
    });
    const stages = await listStages(db, orgId, { includeInactive: true });
    res.json({ stages: stages.map(toStageJson) });
  });

  router.post("/leads/:id/notes", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const { note } = NoteBody.parse(req.body);
    const lead = await leadOr404(orgId, String(req.params.id));
    const activity = await addActivity(db, { leadId: lead.id, type: "note", note, actorUserId: auth.realUser.id });
    await recordAudit(db, {
      ...auditBase(auth, orgId, req.ip),
      action: "lead.note_added",
      targetType: "lead",
      targetId: lead.id,
      details: { activityId: activity.id },
    });
    const users = await listOrgUsers(db, orgId);
    const fresh = (await findLead(db, orgId, lead.id)) ?? lead;
    res.status(201).json({ ...(await loadDetail(orgId, fresh, users)), assignees: assigneesOf(users) });
  });

  return router;
}
