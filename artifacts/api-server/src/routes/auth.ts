import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { organizationsTable, usersTable, type Db, type User } from "@workspace/db";
import { isPlatformRole, type FeatureKey } from "@workspace/features";
import type { AppConfig } from "../lib/config";
import { recordAudit } from "../lib/audit";
import { issueAuthToken, peekAuthToken, redeemAuthToken } from "../lib/auth-tokens";
import { HttpError, badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { sendPasswordReset } from "../lib/invites";
import { checkLoginLimiter, recordLoginAttempt } from "../lib/login-attempts";
import { passwordChangedEmail, type Mailer } from "../lib/mail";
import { hashPassword, passwordProblem, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  createSession,
  revokeAllSessions,
  revokeSession,
  setImpersonation,
  setSessionCookie,
} from "../lib/session";
import { evaluateImpersonation } from "../lib/support-access";
import { activeWindowRows } from "../lib/support-windows";
import {
  findUserByEmail,
  findUserById,
  hasCompletedHandover,
  normalizeEmail,
  toPublicUser,
} from "../lib/users";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  spendRecoveryCode,
  toStoredRecoveryCodes,
  totpUri,
  verifyTotp,
} from "../lib/totp";
import { actorOf, requireAuth, requireAuthContext, requireRealRole, roleOf, type AuthContext } from "../middlewares/auth";

const LoginBody = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
  /** Optional for API callers that already hold the code. */
  totpCode: z.string().trim().max(20).optional(),
});

const MfaBody = z.object({
  mfaToken: z.string().min(1).max(200),
  code: z.string().trim().max(20).optional(),
  recoveryCode: z.string().trim().max(40).optional(),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

const ImpersonateBody = z.object({ userId: z.uuid() });
const ForgotBody = z.object({ email: z.string().trim().min(1).max(320) });
const RedeemBody = z.object({ token: z.string().min(1).max(200), password: z.string().min(1).max(200) });
const TotpEnableBody = z.object({ code: z.string().trim().min(1).max(20) });
const PasswordConfirmBody = z.object({ currentPassword: z.string().min(1).max(200) });

// A fixed hash to verify against when the email is unknown, so a failed login
// takes the same time whether or not the account exists.
const DUMMY_HASH_PROMISE = hashPassword("dummy-password-for-timing-only");

export function sessionPayload(auth: AuthContext, config: AppConfig) {
  return {
    realUser: toPublicUser(auth.realUser),
    effectiveUser: toPublicUser(auth.effectiveUser),
    impersonating: auth.impersonating,
    organization: auth.org
      ? { id: auth.org.id, name: auth.org.name, slug: auth.org.slug, status: auth.org.status }
      : null,
    features: auth.features,
    effectiveFeatures: Array.from(auth.effectiveKeys) as FeatureKey[],
    /** Second factor, for the screens that nudge an operator to enrol. */
    mfa: {
      enabled: auth.realUser.totpEnabledAt !== null,
      required: config.requireMfaForPlatform && isPlatformRole(roleOf(auth.realUser)),
    },
  };
}

export function authRouter(db: Db, config: AppConfig, deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();

  /** Everything a successful sign-in does, however the person got here. */
  async function completeLogin(
    req: Parameters<Parameters<IRouter["post"]>[1]>[0],
    res: Parameters<Parameters<IRouter["post"]>[1]>[1],
    user: User,
    via: "password" | "mfa" | "invite" | "password_reset"
  ) {
    const ip = req.ip ?? null;
    const { token } = await createSession(db, { userId: user.id, ip, userAgent: req.get("user-agent") ?? null }, config);
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    await recordLoginAttempt(db, {
      email: user.email,
      ip,
      userAgent: req.get("user-agent") ?? null,
      outcome: "success",
      userId: user.id,
    });
    await recordAudit(db, {
      orgId: user.orgId,
      actorUserId: user.id,
      action: "auth.login",
      targetType: "session",
      details: { via },
      ip,
    });
    setSessionCookie(res, token, config);
    return { user: toPublicUser({ ...user, lastLoginAt: new Date() }), mustChangePassword: user.mustChangePassword };
  }

  router.post("/auth/login", async (req, res) => {
    const body = LoginBody.parse(req.body);
    const email = normalizeEmail(body.email);
    const ip = req.ip ?? null;
    const userAgent = req.get("user-agent") ?? null;

    const limiter = await checkLoginLimiter(db, {
      email,
      ip,
      maxFailures: config.loginMaxFailures,
      windowMs: config.loginWindowMs,
    });
    if (limiter.retryAfterSeconds > 0) {
      await recordLoginAttempt(db, { email, ip, userAgent, outcome: "rate_limited" });
      res.setHeader("Retry-After", String(limiter.retryAfterSeconds));
      throw new HttpError(
        429,
        "RATE_LIMITED",
        `Too many sign-in attempts. Try again in ${Math.ceil(limiter.retryAfterSeconds / 60)} minute(s).`
      );
    }

    const user = await findUserByEmail(db, email);
    const ok = user
      ? await verifyPassword(body.password, user.passwordHash)
      : await verifyPassword(body.password, await DUMMY_HASH_PROMISE);

    if (!user || !ok) {
      await recordLoginAttempt(db, {
        email,
        ip,
        userAgent,
        outcome: user ? "invalid_password" : "unknown_email",
        userId: user?.id ?? null,
      });
      // Only an existing account earns an audit entry. Logging a miss would
      // turn the audit trail into a way of testing which addresses exist.
      if (user) {
        await recordAudit(db, {
          orgId: user.orgId,
          actorUserId: user.id,
          action: "auth.login_failed",
          targetType: "user",
          targetId: user.id,
          details: { reason: "invalid_password", failuresInWindow: limiter.failures + 1 },
          ip,
        });
      }
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    if (user.status !== "Active") {
      await recordLoginAttempt(db, { email, ip, userAgent, outcome: "suspended", userId: user.id });
      throw new HttpError(403, "ACCOUNT_SUSPENDED", "This account is suspended. Contact your administrator.");
    }

    if (user.orgId) {
      const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.orgId)).limit(1);
      if (org && org.status !== "active") {
        await recordLoginAttempt(db, { email, ip, userAgent, outcome: "org_suspended", userId: user.id });
        throw new HttpError(
          403,
          "ORGANIZATION_SUSPENDED",
          org.status === "decommissioned"
            ? "This organization is no longer active."
            : "This organization is suspended. Contact your provider."
        );
      }
    }

    // ── second factor ────────────────────────────────────────────────────
    if (user.totpEnabledAt && user.totpSecret) {
      if (!body.totpCode) {
        const { token, expiresAt } = await issueAuthToken(db, {
          userId: user.id,
          purpose: "mfa_pending",
          ttlMs: config.mfaPendingTtlMs,
        });
        await recordLoginAttempt(db, { email, ip, userAgent, outcome: "mfa_required", userId: user.id });
        res.json({ mfaRequired: true, mfaToken: token, expiresAt: expiresAt.toISOString() });
        return;
      }
      const check = verifyTotp(user.totpSecret, body.totpCode, {
        lastUsedStep: user.totpLastStep ? Number(user.totpLastStep) : null,
      });
      if (!check.ok) {
        await recordLoginAttempt(db, { email, ip, userAgent, outcome: "mfa_failed", userId: user.id });
        await recordAudit(db, {
          orgId: user.orgId,
          actorUserId: user.id,
          action: "auth.login_failed",
          targetType: "user",
          targetId: user.id,
          details: { reason: `mfa_${check.reason}` },
          ip,
        });
        throw new HttpError(401, "MFA_INVALID", "That code is not valid. Check the app and try again.");
      }
      await db.update(usersTable).set({ totpLastStep: String(check.step) }).where(eq(usersTable.id, user.id));
    }

    res.json(await completeLogin(req, res, user, "password"));
  });

  /** Second step: the code, carried by the short-lived token from step one. */
  router.post("/auth/login/mfa", async (req, res) => {
    const body = MfaBody.parse(req.body);
    const ip = req.ip ?? null;
    const userAgent = req.get("user-agent") ?? null;
    const peeked = await peekAuthToken(db, "mfa_pending", body.mfaToken);
    if (!peeked.ok) throw new HttpError(401, "MFA_EXPIRED", "That sign-in has expired. Start again.");
    const user = peeked.user;

    const limiter = await checkLoginLimiter(db, {
      email: user.email,
      ip,
      maxFailures: config.loginMaxFailures,
      windowMs: config.loginWindowMs,
    });
    if (limiter.retryAfterSeconds > 0) {
      res.setHeader("Retry-After", String(limiter.retryAfterSeconds));
      throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.");
    }

    let accepted = false;
    let usedRecoveryCode = false;
    let remainingRecoveryCodes: number | undefined;

    if (body.recoveryCode) {
      const spent = spendRecoveryCode(user.totpRecoveryCodes, body.recoveryCode);
      if (spent.ok) {
        accepted = true;
        usedRecoveryCode = true;
        remainingRecoveryCodes = spent.remaining;
        await db.update(usersTable).set({ totpRecoveryCodes: spent.codes }).where(eq(usersTable.id, user.id));
      }
    } else if (body.code && user.totpSecret) {
      const check = verifyTotp(user.totpSecret, body.code, {
        lastUsedStep: user.totpLastStep ? Number(user.totpLastStep) : null,
      });
      if (check.ok) {
        accepted = true;
        await db.update(usersTable).set({ totpLastStep: String(check.step) }).where(eq(usersTable.id, user.id));
      }
    }

    if (!accepted) {
      await recordLoginAttempt(db, { email: user.email, ip, userAgent, outcome: "mfa_failed", userId: user.id });
      await recordAudit(db, {
        orgId: user.orgId,
        actorUserId: user.id,
        action: "auth.login_failed",
        targetType: "user",
        targetId: user.id,
        details: { reason: body.recoveryCode ? "recovery_code_invalid" : "mfa_invalid" },
        ip,
      });
      throw new HttpError(401, "MFA_INVALID", "That code is not valid. Check the app and try again.");
    }

    await redeemAuthToken(db, "mfa_pending", body.mfaToken);
    if (usedRecoveryCode) {
      await recordAudit(db, {
        orgId: user.orgId,
        actorUserId: user.id,
        action: "auth.recovery_code_used",
        targetType: "user",
        targetId: user.id,
        details: { remaining: remainingRecoveryCodes },
        ip,
      });
    }
    res.json({ ...(await completeLogin(req, res, user, "mfa")), usedRecoveryCode, remainingRecoveryCodes });
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
    res.json(sessionPayload(requireAuthContext(res), config));
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
    void deps.mailer.send(passwordChangedEmail({ fullName: user.fullName, at: new Date() }), {
      to: user.email,
      userId: user.id,
      orgId: user.orgId,
    });
    res.json({ ok: true });
  });

  // ── self-service recovery ─────────────────────────────────────────────
  //
  // Always answers the same way. "No account with that address" would let
  // anyone test which of their guesses are real.
  router.post("/auth/forgot-password", async (req, res) => {
    const { email: raw } = ForgotBody.parse(req.body);
    const email = normalizeEmail(raw);
    const ip = req.ip ?? null;
    const limiter = await checkLoginLimiter(db, {
      email,
      ip,
      maxFailures: config.loginMaxFailures,
      windowMs: config.loginWindowMs,
    });
    if (limiter.retryAfterSeconds === 0) {
      const user = await findUserByEmail(db, email);
      if (user && user.status === "Active") {
        await sendPasswordReset(db, deps.mailer, config, { user, createdBy: null });
        await recordAudit(db, {
          orgId: user.orgId,
          actorUserId: user.id,
          action: "auth.password_reset_requested",
          targetType: "user",
          targetId: user.id,
          ip,
        });
      }
    }
    res.json({ ok: true });
  });

  /** Is this link still usable? The set-password screen asks before rendering. */
  router.get("/auth/token/:purpose/:token", async (req, res) => {
    const purpose = req.params.purpose;
    if (purpose !== "invite" && purpose !== "password_reset") throw notFound("Unknown link type.");
    const peeked = await peekAuthToken(db, purpose, req.params.token);
    if (!peeked.ok) {
      res.status(400).json({ error: { code: `LINK_${peeked.reason.toUpperCase()}`, message: linkProblem(peeked.reason) } });
      return;
    }
    res.json({ ok: true, purpose, email: peeked.user.email, fullName: peeked.user.fullName });
  });

  for (const [path, purpose] of [
    ["/auth/accept-invite", "invite"],
    ["/auth/reset-password", "password_reset"],
  ] as const) {
    router.post(path, async (req, res) => {
      const body = RedeemBody.parse(req.body);
      const problem = passwordProblem(body.password);
      if (problem) throw badRequest(problem);
      const redeemed = await redeemAuthToken(db, purpose, body.token);
      if (!redeemed) throw new HttpError(400, "LINK_INVALID", "That link is no longer valid. Ask for a new one.");
      await db
        .update(usersTable)
        .set({ passwordHash: await hashPassword(body.password), mustChangePassword: false, updatedAt: new Date() })
        .where(eq(usersTable.id, redeemed.user.id));
      await revokeAllSessions(db, redeemed.user.id);
      await recordAudit(db, {
        orgId: redeemed.user.orgId,
        actorUserId: redeemed.user.id,
        action: purpose === "invite" ? "auth.invite_accepted" : "auth.password_reset_completed",
        targetType: "user",
        targetId: redeemed.user.id,
        ip: req.ip ?? null,
      });
      res.json(await completeLogin(req, res, { ...redeemed.user, mustChangePassword: false }, purpose));
    });
  }

  // ── second factor enrolment ───────────────────────────────────────────
  router.post("/auth/totp/setup", requireAuth, async (req, res) => {
    const auth = requireAuthContext(res);
    if (auth.impersonating) throw forbidden("Stop viewing as another user first.");
    if (auth.realUser.totpEnabledAt) throw new HttpError(409, "MFA_ALREADY_ENABLED", "Two-factor sign-in is already on.");
    const secret = generateTotpSecret();
    await db.update(usersTable).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(usersTable.id, auth.realUser.id));
    void req;
    res.json({
      secret,
      uri: totpUri({ secret, account: auth.realUser.email, issuer: config.mfaIssuer }),
      issuer: config.mfaIssuer,
    });
  });

  router.post("/auth/totp/enable", requireAuth, async (req, res) => {
    const auth = requireAuthContext(res);
    if (auth.impersonating) throw forbidden("Stop viewing as another user first.");
    const { code } = TotpEnableBody.parse(req.body);
    const user = (await findUserById(db, auth.realUser.id))!;
    if (user.totpEnabledAt) throw new HttpError(409, "MFA_ALREADY_ENABLED", "Two-factor sign-in is already on.");
    if (!user.totpSecret) throw badRequest("Start the setup again — no secret is waiting to be confirmed.");
    const check = verifyTotp(user.totpSecret, code);
    if (!check.ok) throw badRequest("That code is not valid. Check the app's clock and try again.");
    const recoveryCodes = generateRecoveryCodes();
    // Deliberately does NOT spend the step. Enrolment proves possession of the
    // secret; it is not a sign-in. Spending it here would refuse the very next
    // sign-in for up to a minute while the person is looking at a code the app
    // says is valid — the surest way to have someone turn the feature off
    // again. The replay guard still applies to every actual sign-in.
    await db
      .update(usersTable)
      .set({
        totpEnabledAt: new Date(),
        totpRecoveryCodes: toStoredRecoveryCodes(recoveryCodes),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));
    await recordAudit(db, {
      orgId: user.orgId,
      actorUserId: user.id,
      action: "auth.mfa_enabled",
      targetType: "user",
      targetId: user.id,
      ip: req.ip ?? null,
    });
    res.json({ ok: true, recoveryCodes });
  });

  router.post("/auth/totp/recovery-codes", requireAuth, async (req, res) => {
    const auth = requireAuthContext(res);
    const { currentPassword } = PasswordConfirmBody.parse(req.body);
    const user = (await findUserById(db, auth.realUser.id))!;
    if (!user.totpEnabledAt) throw badRequest("Two-factor sign-in is not on for this account.");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest("Your current password is incorrect.");
    const recoveryCodes = generateRecoveryCodes();
    await db
      .update(usersTable)
      .set({ totpRecoveryCodes: toStoredRecoveryCodes(recoveryCodes), updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    await recordAudit(db, {
      orgId: user.orgId,
      actorUserId: user.id,
      action: "auth.mfa_recovery_codes_regenerated",
      targetType: "user",
      targetId: user.id,
      ip: req.ip ?? null,
    });
    res.json({ ok: true, recoveryCodes });
  });

  router.delete("/auth/totp", requireAuth, async (req, res) => {
    const auth = requireAuthContext(res);
    if (auth.impersonating) throw forbidden("Stop viewing as another user first.");
    const { currentPassword } = PasswordConfirmBody.parse(req.body);
    const user = (await findUserById(db, auth.realUser.id))!;
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest("Your current password is incorrect.");
    if (config.requireMfaForPlatform && isPlatformRole(roleOf(user))) {
      throw forbidden("This deployment requires two-factor sign-in on provider accounts.");
    }
    await db
      .update(usersTable)
      .set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: null, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    await recordAudit(db, {
      orgId: user.orgId,
      actorUserId: user.id,
      action: "auth.mfa_disabled",
      targetType: "user",
      targetId: user.id,
      ip: req.ip ?? null,
    });
    res.json({ ok: true });
  });

  // ── "View as" (impersonation) — controlled by the REAL identity ────────
  router.post("/auth/impersonate", requireRealRole("Super_Admin", "Platform_Support", "Admin"), async (req, res) => {
    const auth = requireAuthContext(res);
    const { userId } = ImpersonateBody.parse(req.body);
    const target = await findUserById(db, userId);
    if (!target) throw notFound("User not found or suspended.");

    const targetOrgId = target.orgId;
    const [windows, handoverComplete] = await Promise.all([
      targetOrgId ? activeWindowRows(db, targetOrgId) : Promise.resolve([]),
      targetOrgId ? hasCompletedHandover(db, targetOrgId) : Promise.resolve(true),
    ]);

    const decision = evaluateImpersonation({
      actorRole: roleOf(auth.realUser),
      actorId: auth.realUser.id,
      actorOrgId: auth.realUser.orgId,
      targetId: target.id,
      targetRole: roleOf(target),
      targetOrgId,
      targetActive: target.status === "Active",
      hasActiveWindow: windows.length > 0,
      orgHandoverComplete: handoverComplete,
      actorFeatures: auth.effectiveKeys as ReadonlySet<string>,
    });
    if (!decision.ok) {
      const status = decision.code === "TARGET_INACTIVE" ? 404 : decision.code === "SELF" ? 400 : 403;
      throw new HttpError(status, decision.code ?? "FORBIDDEN", decision.message ?? "Not allowed.");
    }

    await setImpersonation(db, auth.session.id, target.id);
    await recordAudit(db, {
      orgId: target.orgId,
      actorUserId: auth.realUser.id,
      impersonatingUserId: target.id,
      action: "auth.impersonation_started",
      targetType: "user",
      targetId: target.id,
      details: {
        target: target.fullName,
        supportWindowId: windows[0]?.id ?? null,
        viaHandoverException: windows.length === 0 && isPlatformRole(roleOf(auth.realUser)),
      },
      ip: req.ip ?? null,
    });
    res.json({ ok: true, supportWindowExpiresAt: windows[0]?.expiresAt?.toISOString() ?? null });
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

function linkProblem(reason: "unknown" | "used" | "expired" | "account_inactive"): string {
  switch (reason) {
    case "used":
      return "That link has already been used. Ask for a new one.";
    case "expired":
      return "That link has expired. Ask for a new one.";
    case "account_inactive":
      return "That account is not active. Contact your administrator.";
    default:
      return "That link is not valid. Ask for a new one.";
  }
}
