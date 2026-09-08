// Organization Admin: accounts inside the org and the tier-2 switchboard.
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { auditLogTable, type Db } from "@workspace/db";
import { isFeatureKey, validateOrgChange, type FeatureKey } from "@workspace/features";
import { recordAudit } from "../lib/audit";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { loadFeatureStates, setOrgFeature } from "../lib/features";
import { createUserAccount, listOrgUsers, resetUserPassword, updateUserAccount } from "../lib/users";
import { actorOf, requireAuth, requireAuthContext, requireRole } from "../middlewares/auth";

const FeaturePatch = z.object({
  enabled: z.boolean().optional(),
  roles: z.partialRecord(z.enum(["Scheduler", "Field_Staff"]), z.boolean()).optional(),
});

const UserBody = z.object({
  email: z.email(),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["Admin", "Scheduler", "Field_Staff"]),
  password: z.string().min(1).max(200).optional(),
});

const UserPatch = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["Admin", "Scheduler", "Field_Staff"]).optional(),
  status: z.enum(["Active", "Suspended"]).optional(),
});

const ResetBody = z.object({ password: z.string().min(1).max(200).optional() });

export function orgRouter(db: Db): IRouter {
  const router: IRouter = Router();

  // Names and roles of everyone in the caller's organization — readable by
  // any signed-in member (schedulers need staff names), so it is registered
  // BEFORE the Admin gate below.
  router.get("/org/directory", requireAuth, async (_req, res) => {
    const auth = requireAuthContext(res);
    const orgId = auth.effectiveUser.orgId;
    if (!orgId) {
      res.json({ users: [] });
      return;
    }
    const users = await listOrgUsers(db, orgId);
    res.json({
      users: users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role, status: u.status, lastLoginAt: u.lastLoginAt })),
    });
  });

  router.use("/org", requireRole("Admin"));

  function orgIdOf(res: Parameters<typeof requireAuthContext>[0]): string {
    const auth = requireAuthContext(res);
    if (!auth.effectiveUser.orgId) throw badRequest("This account is not attached to an organization.");
    return auth.effectiveUser.orgId;
  }

  router.get("/org", (_req, res) => {
    const auth = requireAuthContext(res);
    res.json({ organization: auth.org ? { id: auth.org.id, name: auth.org.name, slug: auth.org.slug, status: auth.org.status } : null });
  });

  router.get("/org/features", async (_req, res) => {
    res.json({ features: await loadFeatureStates(db, orgIdOf(res)) });
  });

  router.put("/org/features/:key", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = orgIdOf(res);
    const key = req.params.key;
    if (!isFeatureKey(key)) throw notFound("Unknown feature.");
    const patch = FeaturePatch.parse(req.body);
    const states = await loadFeatureStates(db, orgId);
    const current = states.find((s) => s.key === key)!;
    const result = validateOrgChange(current, patch);
    if (!result.ok) throw new HttpError(409, result.violation.code, result.violation.message);
    await setOrgFeature(db, orgId, key as FeatureKey, { enabled: result.enabled, roles: result.roles }, auth.realUser.id);
    await recordAudit(db, {
      orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      action: "org.feature_updated",
      targetType: "feature",
      targetId: key,
      details: { enabled: result.enabled, roles: result.roles },
      ip: req.ip ?? null,
    });
    res.json({ key, platformEnabled: current.platformEnabled, orgEnabled: result.enabled, roles: result.roles });
  });

  router.get("/org/users", async (_req, res) => {
    res.json({ users: await listOrgUsers(db, orgIdOf(res)) });
  });

  router.post("/org/users", async (req, res) => {
    const auth = requireAuthContext(res);
    const body = UserBody.parse(req.body);
    const result = await createUserAccount(db, actorOf(req, auth), {
      orgId: orgIdOf(res),
      email: body.email,
      fullName: body.fullName,
      role: body.role,
      password: body.password,
    });
    res.status(201).json(result);
  });

  router.patch("/org/users/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const patch = UserPatch.parse(req.body);
    res.json({ user: await updateUserAccount(db, actorOf(req, auth), orgIdOf(res), req.params.id, patch) });
  });

  router.post("/org/users/:id/reset-password", async (req, res) => {
    const auth = requireAuthContext(res);
    const { password } = ResetBody.parse(req.body ?? {});
    res.json(await resetUserPassword(db, actorOf(req, auth), orgIdOf(res), req.params.id, password));
  });

  router.get("/org/audit", async (req, res) => {
    const orgId = orgIdOf(res);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.orgId, orgId)))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit);
    const users = await listOrgUsers(db, orgId);
    const name = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? null;
    res.json({
      entries: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        actorName: name(r.actorUserId),
        impersonatingName: name(r.impersonatingUserId),
      })),
    });
  });

  return router;
}
