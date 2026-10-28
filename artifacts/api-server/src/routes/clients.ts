// Client records — the first durable client data in the portal.
//
// Creating a client from a lead is the conversion: the client row, the lead's
// move to the funnel's "won" stage and the timeline entry land in one
// transaction, so a lead can never be half-converted.
import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { clientsTable, leadActivitiesTable, leadsTable, type ClientRow, type Db } from "@workspace/db";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { badRequest, conflict, notFound } from "../lib/errors";
import { findLead, findStage, stageOfKind } from "../lib/leads";
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
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const blankToNull = (v: string | undefined): string | null => (v === undefined || v === "" ? null : v);

/** Postgres 23505, whether the driver threw it directly or the ORM wrapped it as `cause`. */
function isUniqueViolation(e: unknown, depth = 0): boolean {
  if (typeof e !== "object" || e === null || depth > 3) return false;
  if ((e as { code?: string }).code === "23505") return true;
  return isUniqueViolation((e as { cause?: unknown }).cause, depth + 1);
}

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

    // Converting a lead needs the lead, in this organization, not yet
    // converted, and a "won" stage to move it to.
    const lead = body.sourceLeadId ? await findLead(db, orgId, body.sourceLeadId) : undefined;
    if (body.sourceLeadId && !lead) throw notFound("Inquiry not found.");
    if (lead?.convertedClientId) throw conflict("LEAD_ALREADY_CONVERTED", "That inquiry has already become a client.");
    const wonStage = lead ? await stageOfKind(db, orgId, "won") : undefined;
    if (lead && !wonStage) throw badRequest("The funnel has no 'converted' stage to move the inquiry to.");
    const fromStage = lead ? await findStage(db, orgId, lead.stageId) : undefined;

    let client: ClientRow;
    try {
      client = await db.transaction(async (tx) => {
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
          })
          .returning();
        if (lead && wonStage) {
          const now = new Date();
          await tx
            .update(leadsTable)
            .set({ stageId: wonStage.id, convertedClientId: created!.id, closedReason: null, lastActivityAt: now, updatedAt: now })
            .where(eq(leadsTable.id, lead.id));
          await tx.insert(leadActivitiesTable).values({
            leadId: lead.id,
            type: "converted",
            details: { clientId: created!.id, from: lead.stageId, to: wonStage.id },
            actorUserId: auth.realUser.id,
          });
        }
        return created!;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("MEDICAID_ID_TAKEN", "A client with that Medicaid ID already exists.");
      throw e;
    }

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
