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
  clientsTable,
  leadActivitiesTable,
  leadStagesTable,
  leadsTable,
  usersTable,
  type Db,
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
  toStageJson,
  type ActivityJson,
  type LeadJson,
  type StageJson,
} from "../lib/leads";
import { leadAssignedEmail, type Mailer } from "../lib/mail";
import { findActiveOrgUser, listOrgUsers, type PublicUser } from "../lib/users";
import { requireAuth, requireAuthContext, requireFeature, requireOrgId, type AuthContext } from "../middlewares/auth";

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
