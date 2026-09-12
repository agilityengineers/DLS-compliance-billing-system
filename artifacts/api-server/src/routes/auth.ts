import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { usersTable, type Db } from "@workspace/db";
import { ROLE_RANK, type FeatureKey } from "@workspace/features";
import type { AppConfig } from "../lib/config";
import { recordAudit } from "../lib/audit";
import { HttpError, badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { hashPassword, passwordProblem, verifyPassword } from "../lib/password";
import { LoginLimiter } from "../lib/rate-limit";
import { clearSessionCookie, createSession, revokeAllSessions, revokeSession, setImpersonation, setSessionCookie } from "../lib/session";
import { findUserByEmail, findUserById, normalizeEmail, toPublicUser } from "../lib/users";
import { actorOf, requireAuth, requireAuthContext, requireRealRole, roleOf, type AuthContext } from "../middlewares/auth";

const LoginBody = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

const ImpersonateBody = z.object({ userId: z.uuid() });

// A fixed hash to verify against when the email is unknown, so a failed login
// takes the same time whether or not the account exists.
const DUMMY_HASH_PROMISE = hashPassword("dummy-password-for-timing-only");

export function sessionPayload(auth: AuthContext) {
  return {
    realUser: toPublicUser(auth.realUser),
    effectiveUser: toPublicUser(auth.effectiveUser),
    impersonating: auth.impersonating,
    organization: auth.org
      ? { id: auth.org.id, name: auth.org.name, slug: auth.org.slug, status: auth.org.status }
      : null,
    features: auth.features,
    effectiveFeatures: Array.from(auth.effectiveKeys) as FeatureKey[],
  };
}

export function authRouter(db: Db, config: AppConfig): IRouter {
  const router: IRouter = Router();
  const limiter = new LoginLimiter(config.loginMaxFailures, config.loginWindowMs);

  router.post("/auth/login", async (req, res) => {
    const body = LoginBody.parse(req.body);
    const email = normalizeEmail(body.email);
    const key = `${req.ip ?? "?"}|${email}`;
    const retryAfter = limiter.retryAfterSeconds(key);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      throw new HttpError(429, "RATE_LIMITED", `Too many sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`);
    }
    const user = await findUserByEmail(db, email);
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : await verifyPassword(body.password, await DUMMY_HASH_PROMISE);
    if (!user || !ok) {
      limiter.recordFailure(key);
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    if (user.status !== "Active") {
      throw new HttpError(403, "ACCOUNT_SUSPENDED", "This account is suspended. Contact your administrator.");
    }
    limiter.reset(key);
    const { token } = await createSession(db, { userId: user.id, ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null }, config);
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    await recordAudit(db, { orgId: user.orgId, actorUserId: user.id, action: "auth.login", targetType: "session", ip: req.ip ?? null });
    setSessionCookie(res, token, config);
    res.json({
      user: toPublicUser({ ...user, lastLoginAt: new Date() }),
      mustChangePassword: user.mustChangePassword,
    });
  });

  router.post("/auth/logout", async (req, res) => {
    const auth = requireAuthContext(res);
    await revokeSession(db, auth.session.id);
    await recordAudit(db, {
      orgId: auth.realUser.orgId,
      actorUserId: auth.realUser.id,
      action: "auth.logout",
      targetType: "session",
      ip: req.ip ?? null,
    });
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  router.get("/auth/me", requireAuth, (_req, res) => {
    res.json(sessionPayload(requireAuthContext(res)));
  });

  router.post("/auth/change-password", requireAuth, async (req, res) => {
    const auth = requireAuthContext(res);
    if (auth.impersonating) throw forbidden("Stop viewing as another user before changing your password.");
    const body = ChangePasswordBody.parse(req.body);
    const user = (await findUserById(db, auth.realUser.id))!;
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw badRequest("Your current password is incorrect.");
    const problem = passwordProblem(body.newPassword);
    if (problem) throw badRequest(problem);
    if (body.newPassword === body.currentPassword) throw badRequest("Choose a password you have not used just now.");
    await db
      .update(usersTable)
      .set({ passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    // Sign out every other device, then keep this one signed in.
    await revokeAllSessions(db, user.id);
    const { token } = await createSession(db, { userId: user.id, ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null }, config);
    setSessionCookie(res, token, config);
    await recordAudit(db, { orgId: user.orgId, actorUserId: user.id, action: "auth.password_changed", targetType: "user", targetId: user.id, ip: req.ip ?? null });
    res.json({ ok: true });
  });

  // ── "View as" (impersonation) — controlled by the REAL identity ────────
  router.post("/auth/impersonate", requireRealRole("Super_Admin", "Admin"), async (req, res) => {
    const auth = requireAuthContext(res);
    const { userId } = ImpersonateBody.parse(req.body);
    if (userId === auth.realUser.id) throw badRequest("You are already yourself.");
    const realRole = roleOf(auth.realUser);
    const target = await findUserById(db, userId);
    if (!target || target.status !== "Active") throw notFound("User not found or suspended.");
    const targetRole = roleOf(target);
    if (ROLE_RANK[targetRole] >= ROLE_RANK[realRole]) throw forbidden("You can only view as a user below your own role.");
    if (realRole === "Admin") {
      if (target.orgId !== auth.realUser.orgId) throw forbidden("That user is not in your organization.");
      if (!auth.effectiveKeys.has("platform.impersonation")) throw forbidden("Impersonation is not enabled for your organization.");
    }
    await setImpersonation(db, auth.session.id, target.id);
    await recordAudit(db, {
      orgId: target.orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: target.id,
      action: "auth.impersonation_started",
      targetType: "user",
      targetId: target.id,
      details: { target: target.fullName },
      ip: req.ip ?? null,
    });
    res.json({ ok: true });
  });

  router.delete("/auth/impersonate", requireAuth, async (req, res) => {
    const auth = requireAuthContext(res);
    if (auth.impersonating) {
      await setImpersonation(db, auth.session.id, null);
      await recordAudit(db, {
        orgId: auth.effectiveUser.orgId,
        actorUserId: auth.realUser.id,
        impersonatingUserId: auth.effectiveUser.id,
        action: "auth.impersonation_stopped",
        targetType: "user",
        targetId: auth.effectiveUser.id,
        details: { target: auth.effectiveUser.fullName },
        ip: req.ip ?? null,
      });
    }
    res.json({ ok: true });
  });

  // Convenience for the web app: the same actor summary the other routes use.
  router.get("/auth/actor", requireAuth, (req, res) => {
    const auth = requireAuthContext(res);
    if (!auth) throw unauthorized();
    res.json(actorOf(req, auth));
  });

  return router;
}
