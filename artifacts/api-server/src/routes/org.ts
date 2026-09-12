// Organization Admin: accounts inside the org and the tier-2 switchboard.
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { auditLogTable, type Db } from "@workspace/db";
import { isFeatureKey, validateOrgChange, type FeatureKey } from "@workspace/features";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { loadFeatureStates, setOrgFeature } from "../lib/features";
import { sendInvite } from "../lib/invites";
import type { Mailer } from "../lib/mail";
import { clampWindowHours } from "../lib/support-access";
import { findWindow, grantWindow, listWindowsForOrg, revokeWindow } from "../lib/support-windows";
import { createUserAccount, findUserById, listOrgUsers, resetUserPassword, updateUserAccount } from "../lib/users";
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

const SupportWindowBody = z.object({
  /** Why the door is being opened. Required: an unexplained grant is not an informed one. */
  reason: z.string().trim().min(4).max(400),
  hours: z.number().positive().max(72),
});

export function orgRouter(db: Db, config: AppConfig, deps: { mailer: Mailer }): IRouter {
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
    // The invitation is the normal path; the one-time password stays in the
    // response as the fallback for a deployment with no mail provider.
    const created = await findUserById(db, result.user.id);
    const invite = created
      ? await sendInvite(db, deps.mailer, config, {
          user: created,
          orgName: auth.org?.name ?? "your organization",
          createdBy: auth.realUser.id,
        })
      : null;
    res.status(201).json({ ...result, invite });
  });

  router.post("/org/users/:id/resend-invite", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = orgIdOf(res);
    const target = await findUserById(db, req.params.id);
    if (!target || target.orgId !== orgId) throw notFound("User not found.");
    const invite = await sendInvite(db, deps.mailer, config, {
      user: target,
      orgName: auth.org?.name ?? "your organization",
      createdBy: auth.realUser.id,
    });
    await recordAudit(db, {
      orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      action: "user.invite_sent",
      targetType: "user",
      targetId: target.id,
      details: { email: target.email, status: invite.status },
      ip: req.ip ?? null,
    });
    res.json({ invite });
  });

  // ── Support access (review decision D-02) ───────────────────────────────
  //
  // The provider cannot open an organization's records at will. An Admin opens
  // a window, for a reason, with an end time; outside one, a support session
  // is refused by the API rather than merely discouraged by policy.
  router.get("/org/support-windows", async (_req, res) => {
    res.json({ windows: await listWindowsForOrg(db, orgIdOf(res)), maxHours: config.supportWindowMaxHours });
  });

  router.post("/org/support-windows", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = orgIdOf(res);
    const body = SupportWindowBody.parse(req.body);
    const hours = clampWindowHours(body.hours, config.supportWindowMaxHours);
    const expiresAt = new Date(Date.now() + hours * 3_600_000);
    const window = await grantWindow(db, {
      orgId,
      grantedByUserId: auth.realUser.id,
      reason: body.reason,
      expiresAt,
    });
    await recordAudit(db, {
      orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
      action: "support.window_granted",
      targetType: "support_window",
      targetId: window.id,
      details: { reason: body.reason, hours, expiresAt: expiresAt.toISOString() },
      ip: req.ip ?? null,
    });
    res.status(201).json({ window: { id: window.id, expiresAt: window.expiresAt.toISOString(), hours } });
  });

  router.delete("/org/support-windows/:id", async (req, res) => {
    const auth = requireAuthContext(res);
    const orgId = orgIdOf(res);
    const existing = await findWindow(db, req.params.id);
    if (!existing || existing.orgId !== orgId) throw notFound("Support window not found.");
    const revoked = await revokeWindow(db, existing.id, auth.realUser.id);
    if (!revoked) throw new HttpError(409, "ALREADY_CLOSED", "That window is already closed.");
    await recordAudit(db, {
      orgId,
      actorUserId: auth.realUser.id,
      action: "support.window_revoked",
      targetType: "support_window",
      targetId: existing.id,
      details: { reason: existing.reason },
      ip: req.ip ?? null,
    });
    res.json({ ok: true });
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
