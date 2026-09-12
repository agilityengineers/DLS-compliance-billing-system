// Provider (Super Admin and Support) console: the overview, tier-1 feature
// switches, organizations and their accounts, feature adoption, live sessions,
// support windows, the platform-wide audit log and system status.
//
// Every route names the capability it needs rather than a role, so a support
// engineer can work an incident without also holding the switchboard. No
// client records are reachable from here at all; support happens through an
// audited view-as session inside a window the organization has granted.
import { Router, type IRouter } from "express";
import { and, count, desc, eq, gte, inArray, like, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import {
  auditLogTable,
  mailOutboxTable,
  orgFeaturesTable,
  organizationsTable,
  usersTable,
  type Db,
} from "@workspace/db";
import { FEATURE_CATALOG, canManageRole, isFeatureKey, isOrgRole, type FeatureKey } from "@workspace/features";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { loadFeatureStates, loadPlatformRows, setPlatformFeature } from "../lib/features";
import { sendInvite } from "../lib/invites";
import { JOBS, findJob, jobStatuses, runJob } from "../lib/jobs";
import { recentFailuresByAccount } from "../lib/login-attempts";
import { supportWindowRequestedEmail, type Mailer } from "../lib/mail";
import { CONFIG_CHANGE_ACTIONS, buildOverview } from "../lib/platform-overview";
import { findSessionById, listActiveSessions, revokeAllSessions, revokeSession } from "../lib/session";
import { listAllWindows } from "../lib/support-windows";
import { collectSystemStatus } from "../lib/system-status";
import {
  createUserAccount,
  findUserById,
  listAllUsers,
  listOrgAdmins,
  resetUserPassword,
  updateUserAccount,
} from "../lib/users";
import {
  actorOf,
  requireAuthContext,
  requireMfaEnrolled,
  requirePlatformCapability,
  requireRole,
  roleOf,
} from "../middlewares/auth";

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

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

const OrgPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  primaryContactName: z.string().trim().max(120).nullable().optional(),
  primaryContactEmail: z.email().nullable().optional(),
  primaryContactPhone: z.string().trim().max(40).nullable().optional(),
  timeZone: z.string().trim().min(3).max(60).optional(),
  baaSignedOn: isoDate.nullable().optional(),
  baaExpiresOn: isoDate.nullable().optional(),
  contractNotes: z.string().trim().max(4000).nullable().optional(),
});

const DecommissionBody = z.object({
  /** Typing the slug is the "are you sure": it cannot be clicked through. */
  confirmSlug: z.string().trim(),
  reason: z.string().trim().min(4).max(400),
});

const UserBody = z.object({
  orgId: z.uuid(),
  email: z.email(),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["Admin", "Scheduler", "Field_Staff"]),
  password: z.string().min(1).max(200).optional(),
});

const ProviderUserBody = z.object({
  email: z.email(),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200).optional(),
});

const UserPatch = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["Admin", "Scheduler", "Field_Staff"]).optional(),
  status: z.enum(["Active", "Suspended"]).optional(),
});

const ResetBody = z.object({ password: z.string().min(1).max(200).optional() });

const SupportRequestBody = z.object({
  orgId: z.uuid(),
  reason: z.string().trim().min(4).max(400),
});

/** Audit actions are namespaced "<category>.<event>"; these are the categories. */
export const AUDIT_CATEGORIES = ["auth", "platform", "org", "user", "session", "support"] as const;

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

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function platformRouter(db: Db, config: AppConfig, deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();
  // Provider accounts only, and — when the deployment insists on it — only
  // after a second factor has been enrolled.
  router.use("/platform", requireRole("Super_Admin", "Platform_Support"), requireMfaEnrolled(config.requireMfaForPlatform));

  const canView = requirePlatformCapability("platform.view");
  const canSwitch = requirePlatformCapability("platform.features");
  const canOrgs = requirePlatformCapability("platform.organizations");
  const canAccounts = requirePlatformCapability("platform.accounts");
  const canProviderAccounts = requirePlatformCapability("platform.provider_accounts");
  const canSupport = requirePlatformCapability("platform.support");
  const canSessions = requirePlatformCapability("platform.sessions");
  const canAudit = requirePlatformCapability("platform.audit");
  const canSystem = requirePlatformCapability("platform.system");

  async function countAudit(where: SQL): Promise<number> {
    const [row] = await db.select({ n: count() }).from(auditLogTable).where(where);
    return row?.n ?? 0;
  }

  async function auditWhere(q: z.infer<typeof AuditQuery>): Promise<SQL | undefined> {
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
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  // ── overview ──────────────────────────────────────────────────────────
  router.get("/platform/overview", canView, async (_req, res) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
    const [
      orgs,
      users,
      platformRows,
      activeSessions,
      windows,
      bruteForce,
      jobs,
      signInsLast7Days,
      failedSignInsLast7Days,
      configChangesLast7Days,
      supportSessionsLast30Days,
    ] = await Promise.all([
      db.select().from(organizationsTable).orderBy(organizationsTable.name),
      listAllUsers(db),
      loadPlatformRows(db),
      listActiveSessions(db, config, now),
      listAllWindows(db, 200),
      recentFailuresByAccount(db, { sinceMs: DAY_MS, minFailures: 5, now }),
      jobStatuses(db),
      countAudit(and(eq(auditLogTable.action, "auth.login"), gte(auditLogTable.createdAt, weekAgo))!),
      countAudit(and(eq(auditLogTable.action, "auth.login_failed"), gte(auditLogTable.createdAt, weekAgo))!),
      countAudit(and(inArray(auditLogTable.action, [...CONFIG_CHANGE_ACTIONS]), gte(auditLogTable.createdAt, weekAgo))!),
      countAudit(and(eq(auditLogTable.action, "auth.impersonation_started"), gte(auditLogTable.createdAt, monthAgo))!),
    ]);

    res.json(
      buildOverview({
        organizations: orgs.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          baaSignedOn: o.baaSignedOn,
          baaExpiresOn: o.baaExpiresOn,
        })),
        users,
        platformEnabled: new Map(platformRows.map((r) => [r.key, r.enabled])),
        activeSessions: activeSessions.map((s) => ({ id: s.id, userId: s.userId, impersonatingUserId: s.impersonatingUserId })),
        openSupportWindows: windows.filter((w) => w.active).map((w) => ({ id: w.id, orgId: w.orgId, expiresAt: w.expiresAt })),
        bruteForce: bruteForce.map((b) => ({
          userId: b.userId,
          fullName: b.fullName,
          email: b.email,
          failures: b.failures,
          addresses: b.addresses,
        })),
        jobs: jobs.map((j) => ({ name: j.name, ok: j.lastRun?.ok ?? null, lastRunAt: j.lastRun?.startedAt ?? null })),
        mailConfigured: config.mail.mode === "sendgrid",
        requireMfaForPlatform: config.requireMfaForPlatform,
        activity: { signInsLast7Days, failedSignInsLast7Days, configChangesLast7Days, supportSessionsLast30Days },
        now,
      })
    );
  });

  // ── tier-1 switches ───────────────────────────────────────────────────
  router.get("/platform/features", canView, async (_req, res) => {
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

  router.put("/platform/features/:key", canSwitch, async (req, res) => {
    const auth = requireAuthContext(res);
    const key = String(req.params.key);
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
  router.get("/platform/adoption", canView, async (_req, res) => {
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
  router.get("/platform/organizations", canView, async (_req, res) => {
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
        primaryContactName: o.primaryContactName,
        primaryContactEmail: o.primaryContactEmail,
        primaryContactPhone: o.primaryContactPhone,
        timeZone: o.timeZone,
        baaSignedOn: o.baaSignedOn,
        baaExpiresOn: o.baaExpiresOn,
        contractNotes: o.contractNotes,
        decommissionedAt: o.decommissionedAt ? o.decommissionedAt.toISOString() : null,
        decommissionReason: o.decommissionReason,
        users: users.filter((u) => u.orgId === o.id),
        featuresConfigured: counts.get(o.id) ?? 0,
      })),
      platformUsers: users.filter((u) => u.orgId === null),
    });
  });

  router.post("/platform/organizations", canOrgs, async (req, res) => {
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

  router.patch("/platform/organizations/:id", canOrgs, async (req, res) => {
    const auth = requireAuthContext(res);
    const patch = OrgPatch.parse(req.body);
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, String(req.params.id))).limit(1);
    if (!org) throw notFound("Organization not found.");
    if (org.status === "decommissioned" && patch.status !== "active") {
      throw new HttpError(
        409,
        "ORG_DECOMMISSIONED",
        "This organization has been decommissioned. Reactivate it before making other changes."
      );
    }
    if (patch.baaSignedOn && patch.baaExpiresOn && patch.baaExpiresOn < patch.baaSignedOn) {
      throw badRequest("The agreement cannot expire before it was signed.");
    }
    const [updated] = await db
      .update(organizationsTable)
      .set({
        ...patch,
        ...(patch.status === "active" && org.status === "decommissioned"
          ? { decommissionedAt: null, decommissionReason: null }
          : {}),
        updatedAt: new Date(),
      })
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

  /**
   * The end of the relationship. Suspending is a pause; this is a close-down,
   * so it also suspends every account and ends every session. The slug has to
   * be typed, because there is no undo button that gives an organization its
   * people back.
   */
  router.post("/platform/organizations/:id/decommission", canOrgs, async (req, res) => {
    const auth = requireAuthContext(res);
    const body = DecommissionBody.parse(req.body);
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, String(req.params.id))).limit(1);
    if (!org) throw notFound("Organization not found.");
    if (org.status === "decommissioned") throw conflict("ALREADY_DECOMMISSIONED", "That organization is already decommissioned.");
    if (body.confirmSlug !== org.slug) throw badRequest(`Type the organization's slug (${org.slug}) to confirm.`);

    const members = await db.select().from(usersTable).where(eq(usersTable.orgId, org.id));
    await db.update(organizationsTable).set({
      status: "decommissioned",
      decommissionedAt: new Date(),
      decommissionReason: body.reason,
      updatedAt: new Date(),
    }).where(eq(organizationsTable.id, org.id));
    for (const member of members) {
      await db.update(usersTable).set({ status: "Suspended", updatedAt: new Date() }).where(eq(usersTable.id, member.id));
      await revokeAllSessions(db, member.id);
    }
    await recordAudit(db, {
      orgId: org.id,
      actorUserId: auth.realUser.id,
      action: "org.decommissioned",
      targetType: "organization",
      targetId: org.id,
      details: { reason: body.reason, accountsSuspended: members.length },
      ip: req.ip ?? null,
    });
    res.json({ ok: true, accountsSuspended: members.length });
  });

  /**
   * Everything the platform holds for one organization, as JSON. Configuration
   * and accounts today; the client records live in the browser's demo dataset
   * and will join this export when they move to the database.
   */
  router.get("/platform/organizations/:id/export", canOrgs, async (req, res) => {
    const auth = requireAuthContext(res);
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, String(req.params.id))).limit(1);
    if (!org) throw notFound("Organization not found.");
    const [users, features, windows, audit] = await Promise.all([
      listAllUsers(db).then((all) => all.filter((u) => u.orgId === org.id)),
      loadFeatureStates(db, org.id),
      listAllWindows(db, 500).then((all) => all.filter((w) => w.orgId === org.id)),
      db.select().from(auditLogTable).where(eq(auditLogTable.orgId, org.id)).orderBy(desc(auditLogTable.createdAt)).limit(5000),
    ]);
    await recordAudit(db, {
      orgId: org.id,
      actorUserId: auth.realUser.id,
      action: "org.exported",
      targetType: "organization",
      targetId: org.id,
      details: { users: users.length, auditEntries: audit.length },
      ip: req.ip ?? null,
    });
    res.setHeader("Content-Disposition", `attachment; filename="${org.slug}-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      exportedBy: auth.realUser.email,
      note: "Configuration and accounts. Client, visit and billing records are not in this database yet.",
      organization: {
        ...org,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        decommissionedAt: org.decommissionedAt ? org.decommissionedAt.toISOString() : null,
      },
      accounts: users,
      features,
      supportWindows: windows,
      auditLog: audit.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    });
  });

  router.get("/platform/users", canView, async (_req, res) => {
    res.json({ users: await listAllUsers(db) });
  });

  router.post("/platform/users", canAccounts, async (req, res) => {
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
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, body.orgId)).limit(1);
    const created = await findUserById(db, result.user.id);
    const invite = created
      ? await sendInvite(db, deps.mailer, config, {
          user: created,
          orgName: org?.name ?? "your organization",
          createdBy: auth.realUser.id,
        })
      : null;
    res.status(201).json({ ...result, invite });
  });

  /**
   * A support account. Cut by the master key, never by the deployment: the
   * Super Admin comes from SUPER_ADMIN_*, and support keys come from here.
   */
  router.post("/platform/provider-users", canProviderAccounts, async (req, res) => {
    const auth = requireAuthContext(res);
    const body = ProviderUserBody.parse(req.body);
    const result = await createUserAccount(db, actorOf(req, auth), {
      orgId: null,
      email: body.email,
      fullName: body.fullName,
      role: "Platform_Support",
      password: body.password,
    });
    res.status(201).json(result);
  });

  router.patch("/platform/users/:id", canAccounts, async (req, res) => {
    const auth = requireAuthContext(res);
    const patch = UserPatch.parse(req.body);
    const user = await updateUserAccount(db, actorOf(req, auth), null, String(req.params.id), patch);
    res.json({ user });
  });

  router.post("/platform/users/:id/reset-password", canAccounts, async (req, res) => {
    const auth = requireAuthContext(res);
    const { password } = ResetBody.parse(req.body ?? {});
    res.json(await resetUserPassword(db, actorOf(req, auth), null, String(req.params.id), password));
  });

  router.post("/platform/users/:id/resend-invite", canAccounts, async (req, res) => {
    const auth = requireAuthContext(res);
    const target = await findUserById(db, String(req.params.id));
    if (!target) throw notFound("User not found.");
    const [org] = target.orgId
      ? await db.select().from(organizationsTable).where(eq(organizationsTable.id, target.orgId)).limit(1)
      : [undefined];
    const invite = await sendInvite(db, deps.mailer, config, {
      user: target,
      orgName: org?.name ?? "the platform",
      createdBy: auth.realUser.id,
    });
    await recordAudit(db, {
      orgId: target.orgId,
      actorUserId: auth.realUser.id,
      action: "user.invite_sent",
      targetType: "user",
      targetId: target.id,
      details: { email: target.email, status: invite.status },
      ip: req.ip ?? null,
    });
    res.json({ invite });
  });

  /** Sign one person out everywhere — the lost-device and off-boarding control. */
  router.delete("/platform/users/:id/sessions", canSessions, async (req, res) => {
    const auth = requireAuthContext(res);
    const target = await findUserById(db, String(req.params.id));
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
  router.get("/platform/sessions", canView, async (_req, res) => {
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

  router.delete("/platform/sessions/:id", canSessions, async (req, res) => {
    const auth = requireAuthContext(res);
    const session = await findSessionById(db, String(req.params.id));
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

  // ── support windows ───────────────────────────────────────────────────
  router.get("/platform/support-windows", canView, async (_req, res) => {
    res.json({ windows: await listAllWindows(db, 200), maxHours: config.supportWindowMaxHours });
  });

  /**
   * Ask an organization to open the door. The provider cannot grant itself a
   * window; all this does is email the Admins and leave a record that the
   * request was made.
   */
  router.post("/platform/support-windows/request", canSupport, async (req, res) => {
    const auth = requireAuthContext(res);
    const body = SupportRequestBody.parse(req.body);
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, body.orgId)).limit(1);
    if (!org) throw notFound("Organization not found.");
    const admins = await listOrgAdmins(db, org.id);
    let sent = 0;
    for (const admin of admins) {
      const result = await deps.mailer.send(
        supportWindowRequestedEmail({
          adminName: admin.fullName,
          requesterName: auth.realUser.fullName,
          orgName: org.name,
          reason: body.reason,
          link: deps.mailer.link("/admin/settings"),
        }),
        { to: admin.email, userId: admin.id, orgId: org.id }
      );
      if (result.status === "sent" || result.status === "logged") sent += 1;
    }
    await recordAudit(db, {
      orgId: org.id,
      actorUserId: auth.realUser.id,
      action: "support.window_requested",
      targetType: "organization",
      targetId: org.id,
      details: { reason: body.reason, adminsNotified: sent },
      ip: req.ip ?? null,
    });
    res.json({ ok: true, adminsNotified: sent, mailConfigured: config.mail.mode === "sendgrid" });
  });

  // ── security ──────────────────────────────────────────────────────────
  /** What the Security screen needs in one call. */
  router.get("/platform/security", canView, async (_req, res) => {
    const now = new Date();
    const [users, windows, failures] = await Promise.all([
      listAllUsers(db),
      listAllWindows(db, 100),
      recentFailuresByAccount(db, { sinceMs: 7 * DAY_MS, minFailures: 1, now }),
    ]);
    const providerAccounts = users.filter((u) => u.orgId === null);
    res.json({
      providerAccounts,
      requireMfaForPlatform: config.requireMfaForPlatform,
      breakGlassConfigured: Boolean(config.breakGlassEmail && config.breakGlassPassword),
      supportWindows: windows,
      supportWindowMaxHours: config.supportWindowMaxHours,
      signInFailures: failures,
    });
  });

  // ── audit ─────────────────────────────────────────────────────────────
  router.get("/platform/audit", canAudit, async (req, res) => {
    const q = AuditQuery.parse(req.query);
    const where = await auditWhere(q);
    const query = db.select().from(auditLogTable);
    const rows = await (where ? query.where(where) : query).orderBy(desc(auditLogTable.createdAt)).limit(q.limit);
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
      retentionYears: config.auditRetentionYears,
    });
  });

  /**
   * Recompute the chain. The work happens in the database, in the same
   * function the insert trigger uses, so the check cannot drift from what it
   * is checking.
   */
  router.get("/platform/audit/verify", canAudit, async (_req, res) => {
    const result = await db.execute(sql`select * from audit_log_verify()`);
    const row = result.rows[0] as unknown as {
      checked: string | number;
      ok: boolean;
      first_bad_seq: string | number | null;
      first_bad_id: string | null;
      last_seq: string | number | null;
      last_hash: string | null;
    };
    res.json({
      ok: Boolean(row?.ok),
      checked: Number(row?.checked ?? 0),
      firstBadSeq: row?.first_bad_seq === null || row?.first_bad_seq === undefined ? null : Number(row.first_bad_seq),
      firstBadId: row?.first_bad_id ?? null,
      lastSeq: row?.last_seq === null || row?.last_seq === undefined ? null : Number(row.last_seq),
      lastHash: row?.last_hash ?? null,
      retentionYears: config.auditRetentionYears,
    });
  });

  /** The whole filtered log as CSV, for the retention file or an auditor. */
  router.get("/platform/audit/export", canAudit, async (req, res) => {
    const auth = requireAuthContext(res);
    const q = AuditQuery.parse({ ...req.query, limit: 500 });
    const where = await auditWhere(q);
    const query = db.select().from(auditLogTable);
    const rows = await (where ? query.where(where) : query).orderBy(auditLogTable.seq).limit(50_000);
    const [users, orgs] = await Promise.all([listAllUsers(db), db.select().from(organizationsTable)]);
    const name = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? "";
    const orgName = (id: string | null) => (id ? orgs.find((o) => o.id === id)?.name ?? "" : "platform");
    const header = ["seq", "when", "actor", "acting_as", "action", "organization", "target_type", "target_id", "details", "ip", "hash"];
    const lines = rows.map((r) =>
      [
        r.seq,
        r.createdAt.toISOString(),
        name(r.actorUserId),
        name(r.impersonatingUserId),
        r.action,
        orgName(r.orgId),
        r.targetType,
        r.targetId ?? "",
        r.details ? JSON.stringify(r.details) : "",
        r.ip ?? "",
        r.hash ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
    await recordAudit(db, {
      orgId: null,
      actorUserId: auth.realUser.id,
      action: "platform.audit_exported",
      targetType: "audit_log",
      details: { rows: rows.length, filters: { ...q, since: q.since?.toISOString() ?? null } },
      ip: req.ip ?? null,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="dls-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([header.join(","), ...lines].join("\n"));
  });

  // ── system ────────────────────────────────────────────────────────────
  router.get("/platform/system", canSystem, async (_req, res) => {
    const [users, platformRows] = await Promise.all([listAllUsers(db), loadPlatformRows(db)]);
    const byKey = new Map(platformRows.map((r) => [r.key, r.enabled]));
    const featuresAvailable = FEATURE_CATALOG.filter((f) => byKey.get(f.key) ?? f.launchDefault).length;
    const providerAccounts = users.filter((u) => u.orgId === null);
    res.json(
      await collectSystemStatus(db, config, {
        platformAccounts: providerAccounts.length,
        platformAccountsWithMfa: providerAccounts.filter((u) => u.mfaEnabled).length,
        featuresAvailable,
      })
    );
  });

  router.get("/platform/jobs", canSystem, async (_req, res) => {
    res.json({
      jobs: await jobStatuses(db),
      schedulerEnabled: config.schedulerEnabled,
      intervalMinutes: Math.round(config.schedulerIntervalMs / 60_000),
      externalCronConfigured: Boolean(config.cronSecret),
    });
  });

  router.post("/platform/jobs/:name/run", canSystem, async (req, res) => {
    const auth = requireAuthContext(res);
    const name = String(req.params.name);
    if (!findJob(name)) throw notFound("Unknown job.");
    const result = await runJob({ db, config, mailer: deps.mailer }, name, "manual");
    await recordAudit(db, {
      orgId: null,
      actorUserId: auth.realUser.id,
      action: "platform.job_run",
      targetType: "job",
      targetId: name,
      details: { ok: result.ok ?? null, items: result.items ?? 0 },
      ip: req.ip ?? null,
    });
    res.json(result);
  });

  /** What the system has tried to send. Subjects only — never a body. */
  router.get("/platform/mail", canSystem, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = await db.select().from(mailOutboxTable).orderBy(desc(mailOutboxTable.createdAt)).limit(limit);
    res.json({
      messages: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      mode: config.mail.mode,
      fromDomain: config.mail.fromDomain,
    });
  });

  void JOBS;
  return router;
}
