// routes/credentialing.ts — the credentialing registry over HTTP.
//
// The registry decides what blocks a staff account from billing, so:
//   · reading it needs a signed-in member of the organization
//   · changing it is Admin-only — these are the switches that stop claims
//   · every write is validated against the generated contract first
//   · the two policy switches are kept coherent (an item nobody is required
//     to hold cannot gate anything)
//
// That last rule is also a CHECK constraint in the migration. This is the
// friendly version of it, not a substitute.
import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import type { Db } from "@workspace/db";
import { requirementsTable, staffCredentialsTable, type RequirementRow } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  ListRequirementsResponse, UpdateRequirementBody, UpdateRequirementParams,
  ListStaffCredentialsQueryParams, ListStaffCredentialsResponse
} from "@workspace/api-zod";

/** DB row → the wire shape the client and engine share. */
function toRequirement(row: RequirementRow) {
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    required: row.required,
    gating: row.gating,
    automated: row.automated,
    vendor: row.vendor,
    appliesTo: row.appliesTo,
    renewsMonths: row.renewsMonths,
    source: row.source,
    note: row.note,
    sortOrder: row.sortOrder,
    authorityCitation: row.authorityCitation,
    authorityUrl: row.authorityUrl,
    verificationStatus: row.verificationStatus,
    verifiedOn: row.verifiedOn,
    verifiedBy: row.verifiedBy,
    verificationNote: row.verificationNote
  };
}

export function credentialingRouter(db: Db): IRouter {
  const router: IRouter = Router();

  // Reading the registry is for any signed-in member — schedulers and field
  // staff see credential state on the screens that use it.
  router.get("/requirements", requireAuth, async (_req, res) => {
    const rows = await db.select().from(requirementsTable).orderBy(asc(requirementsTable.sortOrder));
    res.json(ListRequirementsResponse.parse(rows.map(toRequirement)));
  });

  // Writing it is Admin-only: these toggles decide what blocks a claim.
  router.patch("/requirements/:requirementId", requireAuth, requireRole("Admin"), async (req, res) => {
    const params = UpdateRequirementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid requirement id." });
      return;
    }
    const body = UpdateRequirementBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid requirement update." });
      return;
    }

    const [current] = await db
      .select().from(requirementsTable)
      .where(eq(requirementsTable.id, params.data.requirementId));
    if (!current) {
      res.status(404).json({ error: "No such requirement." });
      return;
    }

    const patch = body.data;
    const required = patch.required ?? current.required;
    // Gating is meaningless on an item nobody has to hold.
    const gating = required ? (patch.gating ?? current.gating) : false;

    const verificationStatus = patch.verificationStatus ?? current.verificationStatus;
    const verifiedOn = patch.verifiedOn !== undefined ? patch.verifiedOn : current.verifiedOn;
    const verifiedBy = patch.verifiedBy !== undefined ? patch.verifiedBy : current.verifiedBy;
    // A sign-off without a signer or a date is not a sign-off. Reject it here so
    // the caller gets a message rather than a constraint violation.
    if (verificationStatus === "confirmed" && (!verifiedOn || !verifiedBy)) {
      res.status(400).json({
        error: "Confirming a requirement needs both who verified it and the date they did."
      });
      return;
    }

    const [updated] = await db
      .update(requirementsTable)
      .set({
        required,
        gating,
        verificationStatus,
        verifiedOn,
        verifiedBy,
        verificationNote: patch.verificationNote !== undefined ? patch.verificationNote : current.verificationNote,
        updatedAt: new Date()
      })
      .where(eq(requirementsTable.id, params.data.requirementId))
      .returning();

    res.json(toRequirement(updated));
  });

  router.get("/staff-credentials", requireAuth, async (req, res) => {
    const query = ListStaffCredentialsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid staff id." });
      return;
    }
    const staffId = query.data.staffId;
    const base = db.select().from(staffCredentialsTable);
    const rows = staffId
      ? await base.where(eq(staffCredentialsTable.staffId, staffId))
      : await base;

    res.json(
      ListStaffCredentialsResponse.parse(
        rows.map((r) => ({
          staff_id: r.staffId,
          requirement_id: r.requirementId,
          status: r.status,
          completed_on: r.completedOn,
          expires_on: r.expiresOn,
          note: r.note,
          waived_by: r.waivedBy,
          waive_reason: r.waiveReason
        }))
      )
    );
  });

  return router;
}
