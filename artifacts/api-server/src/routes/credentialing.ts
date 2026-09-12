// routes/credentialing.ts — the credentialing registry over HTTP.
//
// The registry decides what blocks a staff account from billing, so every
// write is validated against the generated contract before it reaches the
// database, and the two policy switches are kept coherent: an item nobody is
// required to hold cannot gate anything. The same pairing is enforced by a
// CHECK constraint in migrations/0001_credentialing.sql — this is the friendly
// version of that rule, not a substitute for it.
import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { requirementsTable, staffCredentialsTable, type RequirementRow } from "@workspace/db/schema";
import {
  ListRequirementsResponse, UpdateRequirementBody, UpdateRequirementParams,
  ListStaffCredentialsQueryParams, ListStaffCredentialsResponse
} from "@workspace/api-zod";

/**
 * Any Drizzle Postgres handle. The connection is injected rather than imported
 * so these routes can be exercised against an in-process PostgreSQL in tests —
 * importing @workspace/db pulls in a pool that refuses to load without
 * DATABASE_URL, which would make the routes untestable.
 */
// The schema parameter is deliberately `any`: these handlers only touch the two
// credentialing tables by reference, and pinning the parameter would stop a
// pglite-backed handle (used in tests) from satisfying the same signature as
// the node-postgres one used in production.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CredentialingDb = PgDatabase<PgQueryResultHKT, any>;

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

export function createCredentialingRouter(db: CredentialingDb): IRouter {
  const router: IRouter = Router();

  router.get("/requirements", async (_req, res) => {
    const rows = await db.select().from(requirementsTable).orderBy(asc(requirementsTable.sortOrder));
    res.json(ListRequirementsResponse.parse(rows.map(toRequirement)));
  });

  router.patch("/requirements/:requirementId", async (req, res) => {
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

  router.get("/staff-credentials", async (req, res) => {
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
