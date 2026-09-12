// Provider (Super Admin) console: tier-1 feature switches, organizations and
// their administrator accounts. No client records are reachable from here.
import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auditLogTable, orgFeaturesTable, organizationsTable, usersTable, type Db } from "@workspace/db";
import { FEATURE_CATALOG, isFeatureKey, isOrgRole, type FeatureKey } from "@workspace/features";
import { recordAudit } from "../lib/audit";
import { badRequest, conflict, notFound } from "../lib/errors";
import { loadPlatformRows, setPlatformFeature } from "../lib/features";
import { createUserAccount, listAllUsers, resetUserPassword, updateUserAccount } from "../lib/users";
import { actorOf, requireAuthContext, requireRole } from "../middlewares/auth";

const FeatureBody = z.object({ enabled: z.boolean() });

const OrgBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens.")
    .max(60)
    .optional(),
});

const OrgPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

const UserBody = z.object({
  orgId: z.uuid(),
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function platformRouter(db: Db): IRouter {
  const router: IRouter = Router();
  router.use("/platform", requireRole("Super_Admin"));

  router.get("/platform/features", async (_req, res) => {
    const rows = await loadPlatformRows(db);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    res.json({
      features: FEATURE_CATALOG.map((def) => ({
        key: def.key,
        enabled: byKey.get(def.key)?.enabled ?? def.launchDefault,
        updatedAt: byKey.get(def.key)?.updatedAt?.toISOString() ?? null,
      })),
    });
  });

  router.put("/platform/features/:key", async (req, res) => {
    const auth = requireAuthContext(res);
    const key = req.params.key;
    if (!isFeatureKey(key)) throw notFound("Unknown feature.");
    const { enabled } = FeatureBody.parse(req.body);
    await setPlatformFeature(db, key as FeatureKey, enabled, auth.realUser.id);
    await recordAudit(db, {
      orgId: null,
      actorUserId: auth.realUser.id,
      action: "platform.feature_toggled",
      targetType: "feature",
      targetId: key,
      details: { enabled },
      ip: req.ip ?? null,
    });
    res.json({ key, enabled });
  });

  router.get("/platform/organizations", async (_req, res) => {
    const orgs = await db.select().from(organizationsTable).orderBy(organizationsTable.name);
    const users = await listAllUsers(db);
    const enabledCounts = await db
      .select({ orgId: orgFeaturesTable.orgId, n: sql<number>`count(*) filter (where ${orgFeaturesTable.enabled})`.mapWith(Number) })
      .from(orgFeaturesTable)
      .groupBy(orgFeaturesTable.orgId);
    const counts = new Map(enabledCounts.map((r) => [r.orgId, r.n]));
    res.json({
      organizations: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        users: users.filter((u) => u.orgId === o.id),
        featuresConfigured: counts.get(o.id) ?? 0,
      })),
      platformUsers: users.filter((u) => u.orgId === null),
    });
  });

  router.post("/platform/organizations", async (req, res) => {
    const auth = requireAuthContext(res);
    const body = OrgBody.parse(req.body);
    const slug = body.slug ?? slugify(body.name);
    if (!slug) throw badRequest("Could not derive a slug from that name.");
    const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug)).limit(1);
    if (existing) throw conflict("SLUG_TAKEN", "An organization with that slug already exists.");
    const [org] = await db.insert(organizationsTable).values({ name: body.name, slug }).returning();
    await recordAudit(db, {
      orgId: org!.id,
      actorUserId: auth.realUser.id,
      action: "org.created",
      targetType: "organization",
      targetId: org!.id,
      details: { name: body.name, slug },
      ip: req.ip ?? null,
    });
    res.status(201).json({ organization: { id: org!.id, name: org!.name, slug: org!.slug, status: org!.status } });
  });

  router.patch("/platform/organizations/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const patch = OrgPatch.parse(req.body);
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, req.params.id)).limit(1);
    if (!org) throw notFound("Organization not found.");
    const [updated] = await db
      .update(organizationsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(organizationsTable.id, org.id))
      .returning();
    await recordAudit(db, {
      orgId: org.id,
      actorUserId: auth.realUser.id,
      action: "org.updated",
      targetType: "organization",
      targetId: org.id,
      details: { ...patch },
      ip: req.ip ?? null,
    });
    res.json({ organization: { id: updated!.id, name: updated!.name, slug: updated!.slug, status: updated!.status } });
  });

  router.get("/platform/users", async (_req, res) => {
    res.json({ users: await listAllUsers(db) });
  });

  router.post("/platform/users", async (req, res) => {
    const auth = requireAuthContext(res);
    const body = UserBody.parse(req.body);
    if (!isOrgRole(body.role)) throw badRequest("Unknown role.");
    const result = await createUserAccount(db, actorOf(req, auth), {
      orgId: body.orgId,
      email: body.email,
      fullName: body.fullName,
      role: body.role,
      password: body.password,
    });
    res.status(201).json(result);
  });

  router.patch("/platform/users/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const patch = UserPatch.parse(req.body);
    const user = await updateUserAccount(db, actorOf(req, auth), null, req.params.id, patch);
    res.json({ user });
  });

  router.post("/platform/users/:id/reset-password", async (req, res) => {
    const auth = requireAuthContext(res);
    const { password } = ResetBody.parse(req.body ?? {});
    res.json(await resetUserPassword(db, actorOf(req, auth), null, req.params.id, password));
  });

  router.get("/platform/audit", async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const rows = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit);
    const users = await listAllUsers(db);
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

// Keep the users table import referenced for type inference on select().
void usersTable;
