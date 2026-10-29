// Client records — the first durable client data in the portal.
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
import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { clientsTable, leadActivitiesTable, leadsTable, type ClientRow, type Db, type LeadRow, type LeadStageRow } from "@workspace/db";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { badRequest, conflict, notFound } from "../lib/errors";
import { findStage, lockLead, stageOfKind } from "../lib/leads";
import type { Mailer } from "../lib/mail";
import { requireAuth, requireAuthContext, requireFeature, requireOrgId } from "../middlewares/auth";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const optionalText = (max: number) => z.string().trim().max(max).optional();

const ClientBody = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.union([z.literal(""), z.email().max(254)]).optional(),
  phone: optionalText(40),
  medicaidId: optionalText(40),
  dateOfBirth: z.union([z.literal(""), isoDate]).optional(),
  activeDiagnoses: z.array(z.object({ code: z.string().trim().min(1).max(20), description: z.string().trim().max(200) })).max(50).optional(),
  insuranceProvider: optionalText(120),
  servicePlanStart: z.union([z.literal(""), isoDate]).optional(),
  servicePlanEnd: z.union([z.literal(""), isoDate]).optional(),
  authorizedSccHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  authorizedNmtTripsPerWeek: z.coerce.number().int().min(0).max(100).optional(),
  authorizedJcHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  authorizedDhHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  authorizedEiHoursPerWeek: z.coerce.number().min(0).max(168).optional(),
  caseManagerName: optionalText(120),
  ccbName: optionalText(120),
  residenceLat: z.coerce.number().min(-90).max(90).nullable().optional(),
  residenceLng: z.coerce.number().min(-180).max(180).nullable().optional(),
  /** The inquiry this client came from; converting it is part of the same write. */
  sourceLeadId: z.uuid().optional(),
});

export interface ClientJson {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  medicaidId: string | null;
  dateOfBirth: string | null;
  activeDiagnoses: { code: string; description: string }[];
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
  status: ClientRow["status"];
  /** The inquiry this client was created from, when there was one. */
  sourceLeadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toClientJson(c: ClientRow): ClientJson {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    medicaidId: c.medicaidId,
    dateOfBirth: c.dateOfBirth,
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
    status: c.status,
    sourceLeadId: c.sourceLeadId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const blankToNull = (v: string | undefined): string | null => (v === undefined || v === "" ? null : v);

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

/**
 * The 409 names the client when it is known, so a request retried after its
 * first copy succeeded — a double click, a resent request after a dropped
 * reply — can find what that copy made instead of being left with nothing.
 */
const alreadyConverted = (clientId: string | null = null) =>
  conflict("LEAD_ALREADY_CONVERTED", "That inquiry has already become a client.", clientId ? { clientId } : undefined);

export function clientsRouter(db: Db, _config: AppConfig, _deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();
  router.use("/clients", requireAuth, requireFeature("clients.core"));

  router.get("/clients", async (_req, res) => {
    const orgId = requireOrgId(res);
    const rows = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.orgId, orgId))
      .orderBy(asc(clientsTable.lastName), asc(clientsTable.firstName));
    res.json({ clients: rows.map(toClientJson) });
  });

  router.get("/clients/:id", async (req, res) => {
    const orgId = requireOrgId(res);
    const [row] = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.orgId, orgId), eq(clientsTable.id, String(req.params.id))))
      .limit(1);
    if (!row) throw notFound("Client not found.");
    res.json({ client: toClientJson(row) });
  });

  router.post("/clients", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = requireOrgId(res);
    const body = ClientBody.parse(req.body);

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

        const [created] = await tx
          .insert(clientsTable)
          .values({
            orgId,
            firstName: body.firstName,
            lastName: body.lastName,
            email: blankToNull(body.email)?.toLowerCase() ?? null,
            phone: blankToNull(body.phone),
            medicaidId: blankToNull(body.medicaidId),
            dateOfBirth: blankToNull(body.dateOfBirth),
            activeDiagnoses: body.activeDiagnoses ?? [],
            insuranceProvider: blankToNull(body.insuranceProvider),
            servicePlanStart: blankToNull(body.servicePlanStart),
            servicePlanEnd: blankToNull(body.servicePlanEnd),
            authorizedSccHoursPerWeek: body.authorizedSccHoursPerWeek ?? 0,
            authorizedNmtTripsPerWeek: body.authorizedNmtTripsPerWeek ?? 0,
            authorizedJcHoursPerWeek: body.authorizedJcHoursPerWeek ?? 0,
            authorizedDhHoursPerWeek: body.authorizedDhHoursPerWeek ?? 0,
            authorizedEiHoursPerWeek: body.authorizedEiHoursPerWeek ?? 0,
            caseManagerName: blankToNull(body.caseManagerName),
            ccbName: blankToNull(body.ccbName),
            residenceLat: body.residenceLat ?? null,
            residenceLng: body.residenceLng ?? null,
            createdByUserId: auth.realUser.id,
            sourceLeadId: lead?.id ?? null,
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
      if (violated === "uq_clients_source_lead" || violated === "uq_leads_converted_client") throw alreadyConverted();
      if (violated !== null) throw conflict("MEDICAID_ID_TAKEN", "A client with that Medicaid ID already exists.");
      throw e;
    }
    const { client, lead, fromStage, wonStage } = outcome;

    const actor = {
      orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      ip: req.ip ?? null,
    };
    await recordAudit(db, {
      ...actor,
      action: "client.created",
      targetType: "client",
      targetId: client.id,
      details: { sourceLeadId: lead?.id ?? null },
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

  return router;
}
