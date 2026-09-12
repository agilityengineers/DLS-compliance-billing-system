// Provider (Super Admin) console: the overview, tier-1 feature switches,
// organizations and their accounts, feature adoption per organization, live
// sessions, the platform-wide audit log and system status. No client records
// are reachable from here.
import { Router, type IRouter } from "express";
import { and, count, desc, eq, gte, inArray, like, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { auditLogTable, orgFeaturesTable, organizationsTable, type Db } from "@workspace/db";
import { FEATURE_CATALOG, canManageRole, isFeatureKey, isOrgRole, type FeatureKey } from "@workspace/features";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { loadFeatureStates, loadPlatformRows, setPlatformFeature } from "../lib/features";
import { CONFIG_CHANGE_ACTIONS, buildOverview } from "../lib/platform-overview";
import { findSessionById, listActiveSessions, revokeAllSessions, revokeSession } from "../lib/session";
import { collectSystemStatus } from "../lib/system-status";
import { createUserAccount, findUserById, listAllUsers, resetUserPassword, updateUserAccount } from "../lib/users";
import { actorOf, requireAuthContext, requireRole, roleOf } from "../middlewares/auth";

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

/** Audit actions are namespaced "<category>.<event>"; these are the categories. */
export const AUDIT_CATEGORIES = ["auth", "platform", "org", "user", "session"] as const;

const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).catch(100),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  /** One action, or several separated by commas. */
  action: z.string().trim().min(1).max(400).optional(),
  orgId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  since: z.coerce.date().optional(),
});

const DAY_MS = 86_400_000;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function platformRouter(db: Db, config: AppConfig): IRouter {
  const router: IRouter = Router();
  router.use("/platform", requireRole("Super_Admin"));

  async function countAudit(where: SQL): Promise<number> {
    const [row] = await db.select({ n: count() }).from(auditLogTable).where(where);
    return row?.n ?? 0;
  }

  // ── overview ──────────────────────────────────────────────────────────
  router.get("/platform/overview", async (_req, res) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
    const [orgs, users, platformRows, activeSessions, signInsLast7Days, configChangesLast7Days, supportSessionsLast30Days] =
      await Promise.all([
        db.select().from(organizationsTable).orderBy(organizationsTable.name),
        listAllUsers(db),
        loadPlatformRows(db),
        listActiveSessions(db, config, now),
        countAudit(and(eq(auditLogTable.action, "auth.login"), gte(auditLogTable.createdAt, weekAgo))!),
        countAudit(and(inArray(auditLogTable.action, [...CONFIG_CHANGE_ACTIONS]), gte(auditLogTable.createdAt, weekAgo))!),
        countAudit(and(eq(auditLogTable.action, "auth.impersonation_started"), gte(auditLogTable.createdAt, monthAgo))!),
      ]);
    res.json(
      buildOverview({
        organizations: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, status: o.status, createdAt: o.createdAt.toISOString() })),
        users,
        platformEnabled: new Map(platformRows.map((r) => [r.key, r.enabled])),
        activeSessions: activeSessions.map((s) => ({ id: s.id, userId: s.userId, impersonatingUserId: s.impersonatingUserId })),
        activity: { signInsLast7Days, configChangesLast7Days, supportSessionsLast30Days },
        now,
      })
    );
  });

  // ── tier-1 switches ───────────────────────────────────────────────────
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

  /** Both tiers for every organization — who has switched on what. */
  router.get("/platform/adoption", async (_req, res) => {
    const orgs = await db.select().from(organizationsTable).orderBy(organizationsTable.name);
    const organizations = await Promise.all(
      orgs.map(async (o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        features: await loadFeatureStates(db, o.id),
      }))
    );
    res.json({ organizations });
  });

  // ── organizations & accounts ──────────────────────────────────────────
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

  /** Sign one person out everywhere — the lost-device and off-boarding control. */
  router.delete("/platform/users/:id/sessions", async (req, res) => {
    const auth = requireAuthContext(res);
    const target = await findUserById(db, req.params.id);
    if (!target) throw notFound("User not found.");
    if (target.id === auth.realUser.id) throw badRequest("Use Sign out to end your own sessions.");
    if (!canManageRole(roleOf(auth.realUser), roleOf(target))) throw forbidden("You cannot manage that account.");
    const revoked = await revokeAllSessions(db, target.id);
    await recordAudit(db, {
      orgId: target.orgId,
      actorUserId: auth.realUser.id,
      action: "user.sessions_revoked",
      targetType: "user",
      targetId: target.id,
      details: { fullName: target.fullName, revoked },
      ip: req.ip ?? null,
    });
    res.json({ ok: true, revoked });
  });

  // ── live sessions ─────────────────────────────────────────────────────
  router.get("/platform/sessions", async (_req, res) => {
    const auth = requireAuthContext(res);
    const [sessions, users, orgs] = await Promise.all([
      listActiveSessions(db, config),
      listAllUsers(db),
      db.select().from(organizationsTable),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    res.json({
      sessions: sessions.flatMap((s) => {
        const user = userById.get(s.userId);
        if (!user) return [];
        const target = s.impersonatingUserId ? userById.get(s.impersonatingUserId) : undefined;
        return [
          {
            id: s.id,
            userId: user.id,
            userName: user.fullName,
            userEmail: user.email,
            role: user.role,
            orgId: user.orgId,
            orgName: user.orgId ? orgById.get(user.orgId)?.name ?? null : null,
            impersonatingUserId: target?.id ?? null,
            impersonatingName: target?.fullName ?? null,
            createdAt: s.createdAt.toISOString(),
            lastSeenAt: s.lastSeenAt.toISOString(),
            expiresAt: s.expiresAt.toISOString(),
            ip: s.ip,
            userAgent: s.userAgent,
            current: s.id === auth.session.id,
          },
        ];
      }),
    });
  });

  router.delete("/platform/sessions/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const session = await findSessionById(db, req.params.id);
    if (!session || session.revokedAt) throw notFound("Session not found or already ended.");
    if (session.id === auth.session.id) throw badRequest("Use Sign out to end your own session.");
    const owner = await findUserById(db, session.userId);
    if (owner && !canManageRole(roleOf(auth.realUser), roleOf(owner))) throw forbidden("You cannot manage that account.");
    await revokeSession(db, session.id);
    await recordAudit(db, {
      orgId: owner?.orgId ?? null,
      actorUserId: auth.realUser.id,
      action: "session.revoked",
      targetType: "session",
      targetId: session.id,
      details: { userId: session.userId, fullName: owner?.fullName ?? null, impersonating: session.impersonatingUserId },
      ip: req.ip ?? null,
    });
    res.json({ ok: true });
  });

  // ── audit ─────────────────────────────────────────────────────────────
  router.get("/platform/audit", async (req, res) => {
    const q = AuditQuery.parse(req.query);
    const conditions: SQL[] = [];
    if (q.category) conditions.push(like(auditLogTable.action, `${q.category}.%`));
    if (q.action) {
      const actions = q.action.split(",").map((a) => a.trim()).filter(Boolean);
      if (actions.length === 1) conditions.push(eq(auditLogTable.action, actions[0]!));
      else if (actions.length > 1) conditions.push(inArray(auditLogTable.action, actions));
    }
    if (q.orgId) conditions.push(eq(auditLogTable.orgId, q.orgId));
    if (q.actorUserId) conditions.push(eq(auditLogTable.actorUserId, q.actorUserId));
    if (q.since) conditions.push(gte(auditLogTable.createdAt, q.since));
    const query = db.select().from(auditLogTable);
    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(q.limit);
    const [users, orgs] = await Promise.all([listAllUsers(db), db.select().from(organizationsTable)]);
    const name = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? null;
    const orgName = (id: string | null) => (id ? orgs.find((o) => o.id === id)?.name ?? null : null);
    res.json({
      entries: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        actorName: name(r.actorUserId),
        impersonatingName: name(r.impersonatingUserId),
        orgName: orgName(r.orgId),
      })),
    });
  });

  // ── system ────────────────────────────────────────────────────────────
  router.get("/platform/system", async (_req, res) => {
    const [users, platformRows] = await Promise.all([listAllUsers(db), loadPlatformRows(db)]);
    const byKey = new Map(platformRows.map((r) => [r.key, r.enabled]));
    const featuresAvailable = FEATURE_CATALOG.filter((f) => byKey.get(f.key) ?? f.launchDefault).length;
    res.json(
      await collectSystemStatus(db, config, {
        platformAccounts: users.filter((u) => u.role === "Super_Admin").length,
        featuresAvailable,
      })
    );
  });

  return router;
}
