// First-boot provisioning, safe to run on every start:
//   1. one tier-1 row per catalog feature (new keys get their launch default)
//   2. the first organization
//   3. the platform owner (Super Admin) account — only from a one-time setup
//      password the deployment supplies; there is no built-in default
//   4. the shipped credentialing requirements registry
//   5. every organization's lead funnel and public-form questions (defaults
//      only — rows the agency already has are never touched)
//   6. any website inquiry the earlier storage-only endpoint saved before the
//      inbox existed, moved into the first organization's inbox
// Nothing here ever changes an existing account's password unless
// SUPER_ADMIN_FORCE_RESET=true, and re-seeding the registry never overwrites an
// agency's own policy decisions. The one state change made to an existing
// account is to flag one still holding the retired bootstrap password so that
// it must be replaced at its next sign-in (see LEGACY_BOOTSTRAP_HASH): the
// password itself is left alone, and the flag is audited and logged.
import { and, count, eq } from "drizzle-orm";
import { organizationsTable, usersTable, type Db } from "@workspace/db";
import { seedLeadDefaults, seedRequirements } from "@workspace/db/seed";
import type { AppConfig } from "./config";
import { ensurePlatformRows } from "./features";
import { importConsultationRequests } from "./leads";
import { logger } from "./logger";
import { hashPassword, passwordProblem } from "./password";
import { recordAudit } from "./audit";
import { revokeAllSessions } from "./session";
import { findUserByEmail } from "./users";

/**
 * The scrypt hash that earlier builds committed as the Super Admin's default
 * password. The password behind it was known to anyone with the repository,
 * so it is retired: nothing is ever created from it again. It is kept ONLY so
 * that an account still carrying it can be recognised on boot and made to
 * choose a new password at its next sign-in. The hash has a fixed salt, which
 * is what makes an exact string comparison sufficient — the password itself
 * no longer appears anywhere in this codebase.
 */
export const LEGACY_BOOTSTRAP_HASH =
  "scrypt$16384$8$1$DiQ+q1qbZruivKGHhq4U6Q==$k3SD+tIebz7KXvjNkyBmOFH48BSFlu8s2dMsanCUmH7GveHdEPW53JbVqMJ9S6lYxYg0chxbGKPhVa9HjdjcXg==";

export interface BootstrapResult {
  platformRowsAdded: number;
  orgId: string;
  orgCreated: boolean;
  /** Null when the configured provider account does not exist and no setup password was supplied. */
  superAdminId: string | null;
  superAdminCreated: boolean;
  /**
   * True when the deployment must set SUPER_ADMIN_PASSWORD (to a strong,
   * one-time value) and restart before anyone can administer the platform.
   * The API still serves; the readiness probe and System status say so.
   */
  superAdminSetupRequired: boolean;
  /** Why setup could not complete, in one sentence, or null. */
  superAdminSetupProblem: string | null;
  /** Accounts found still holding the retired bootstrap password and flagged on this boot. */
  legacyPasswordAccountsFlagged: number;
  /** The second provider account, when the deployment supplies one. */
  breakGlassId: string | null;
  breakGlassCreated: boolean;
  requirementsSeeded: number;
  /** Organizations whose lead funnel and form were checked for missing defaults. */
  leadDefaultsChecked: number;
  /** Stored consultation requests moved into the leads inbox on this boot. */
  consultationsImported: number;
}

/** How many accounts still carry the retired bootstrap password, flagged or not. */
export async function countLegacyPasswordAccounts(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(usersTable).where(eq(usersTable.passwordHash, LEGACY_BOOTSTRAP_HASH));
  return row?.n ?? 0;
}

export async function bootstrapPlatform(db: Db, config: AppConfig): Promise<BootstrapResult> {
  const platformRowsAdded = await ensurePlatformRows(db);

  // The credentialing registry decides what blocks a claim, so an empty one is
  // not a neutral starting state — it would mean nothing is required of
  // anybody. Install the shipped defaults. The seed refreshes the wording and
  // citations we own and leaves the agency's own toggles and sign-offs alone,
  // so this is safe on every restart, not just the first.
  // `$client` is the node-postgres pool behind this Drizzle handle: the seed
  // speaks numbered placeholders, and passing them through keeps every value
  // parameterised rather than interpolated into SQL.
  const { seeded: requirementsSeeded } = await seedRequirements((text, params) =>
    db.$client.query(text, params as unknown[])
  );

  let orgCreated = false;
  let [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, config.defaultOrgSlug)).limit(1);
  if (!org) {
    [org] = await db.insert(organizationsTable).values({ name: config.defaultOrgName, slug: config.defaultOrgSlug }).returning();
    orgCreated = true;
  }

  // Every organization gets a funnel and a form. The seed only adds what is
  // missing, so an agency that renamed a stage or retired a question keeps
  // that decision across restarts.
  const orgs = await db.select({ id: organizationsTable.id }).from(organizationsTable);
  for (const o of orgs) {
    await seedLeadDefaults((text, params) => db.$client.query(text, params as unknown[]), o.id);
  }
  const leadDefaultsChecked = orgs.length;

  // Inquiries the earlier storage-only endpoint saved before the inbox existed
  // belong to the first organization. A failure here is logged, never fatal:
  // the rows stay where they are and the next boot tries again.
  let consultationsImported = 0;
  try {
    consultationsImported = await importConsultationRequests(db, org!.id);
    if (consultationsImported > 0) {
      logger.info({ imported: consultationsImported }, "Moved stored consultation requests into the leads inbox");
    }
  } catch (err) {
    logger.error({ err }, "Could not import stored consultation requests; they remain in consultation_requests");
  }

  // ── The provider account ────────────────────────────────────────────────
  // Created once, from a setup password the deployment supplies, and never
  // from a value in this repository. The setup password is single-use: the
  // account is created with mustChangePassword set, so the first sign-in
  // cannot proceed past choosing a new one (see passwordChangeGate). Without
  // a usable setup password nothing is created — the platform runs without
  // an owner until the operator supplies one, and says so loudly.
  let superAdminCreated = false;
  let superAdminSetupRequired = false;
  let superAdminSetupProblem: string | null = null;
  let admin = await findUserByEmail(db, config.superAdminEmail);
  if (!admin) {
    const problem = config.superAdminPassword
      ? passwordProblem(config.superAdminPassword)
      : "SUPER_ADMIN_PASSWORD is not set.";
    if (problem) {
      superAdminSetupRequired = true;
      superAdminSetupProblem = `${problem} Set SUPER_ADMIN_PASSWORD to a strong one-time setup password and restart; the account is created at boot and must be replaced at its first sign-in.`;
      logger.error(
        { email: config.superAdminEmail, problem },
        "The provider account does not exist and was not created: no usable setup password. Set SUPER_ADMIN_PASSWORD and restart."
      );
    } else {
      [admin] = await db
        .insert(usersTable)
        .values({
          orgId: null,
          email: config.superAdminEmail,
          fullName: config.superAdminName,
          role: "Super_Admin",
          status: "Active",
          passwordHash: await hashPassword(config.superAdminPassword!),
          mustChangePassword: true,
        })
        .returning();
      superAdminCreated = true;
      await recordAudit(db, {
        orgId: null,
        actorUserId: null,
        action: "platform.bootstrap",
        targetType: "user",
        targetId: admin!.id,
        details: { email: config.superAdminEmail, passwordSource: "env", mustChangePassword: true },
      });
      logger.warn(
        { email: config.superAdminEmail },
        "Super Admin account created from SUPER_ADMIN_PASSWORD — it must be replaced at the first sign-in; remove the variable from the environment now"
      );
    }
  } else if (config.superAdminForceReset) {
    // An explicit, audited rotation from the secret store — the recovery path
    // of last resort. It is never silent: every other device is signed out,
    // the new password is itself single-use, and the warning repeats on every
    // boot until the flag is unset.
    const problem = config.superAdminPassword ? passwordProblem(config.superAdminPassword) : "SUPER_ADMIN_PASSWORD is not set.";
    if (problem) {
      logger.error({ email: config.superAdminEmail, problem }, "SUPER_ADMIN_FORCE_RESET is true but the password cannot be used; nothing was reset");
    } else {
      await db
        .update(usersTable)
        .set({
          passwordHash: await hashPassword(config.superAdminPassword!),
          mustChangePassword: true,
          status: "Active",
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, admin.id));
      const sessionsRevoked = await revokeAllSessions(db, admin.id);
      await recordAudit(db, {
        orgId: null,
        actorUserId: null,
        action: "platform.super_admin_password_reset",
        targetType: "user",
        targetId: admin.id,
        details: { via: "SUPER_ADMIN_FORCE_RESET", sessionsRevoked, mustChangePassword: true },
      });
      logger.warn(
        { email: config.superAdminEmail, sessionsRevoked },
        "Super Admin password reset from SUPER_ADMIN_PASSWORD and every session ended — unset SUPER_ADMIN_FORCE_RESET now; the new password must be replaced at the next sign-in"
      );
    }
  }

  // ── Accounts still on the retired default ───────────────────────────────
  // An account created by an earlier build from the committed hash, whose
  // owner never changed the password, is holding a password anyone with the
  // repository could read. The password is not touched (that would be a
  // silent credential change); the account is flagged so its next sign-in
  // must choose a new one, and the flag is audited. Idempotent: once the
  // password changes the hash no longer matches.
  const legacyRows = await db
    .select({ id: usersTable.id, email: usersTable.email, orgId: usersTable.orgId })
    .from(usersTable)
    .where(and(eq(usersTable.passwordHash, LEGACY_BOOTSTRAP_HASH), eq(usersTable.mustChangePassword, false)));
  for (const row of legacyRows) {
    await db.update(usersTable).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(usersTable.id, row.id));
    await recordAudit(db, {
      orgId: row.orgId,
      actorUserId: null,
      action: "platform.legacy_password_flagged",
      targetType: "user",
      targetId: row.id,
      details: { email: row.email, reason: "retired_bootstrap_password" },
    });
    logger.warn(
      { email: row.email },
      "Account still holds the retired bootstrap password that earlier builds shipped; it must choose a new one at its next sign-in"
    );
  }
  const legacyPasswordAccountsFlagged = legacyRows.length;

  // ── The break-glass account ─────────────────────────────────────────────
  // One provider password is a single point of failure: lose it, and the only
  // way back in is a deployment change made by whoever holds the secrets. A
  // second provider account, created from its own environment variables and
  // used almost never, turns that lockout into a sign-in. It is deliberately
  // not creatable from any screen — a key kept in the building is not a spare
  // key. Its password stays as set in the secret store (no forced change), so
  // that store remains the one place the spare key lives.
  let breakGlassId: string | null = null;
  let breakGlassCreated = false;
  if (config.breakGlassEmail && config.breakGlassPassword) {
    const problem = passwordProblem(config.breakGlassPassword);
    if (config.breakGlassEmail === config.superAdminEmail) {
      logger.warn("SUPER_ADMIN_BREAKGLASS_EMAIL matches the primary provider account; skipping");
    } else if (problem) {
      logger.error({ email: config.breakGlassEmail, problem }, "SUPER_ADMIN_BREAKGLASS_PASSWORD is too weak; the break-glass account was not created");
    } else {
      const existing = await findUserByEmail(db, config.breakGlassEmail);
      if (existing) {
        breakGlassId = existing.id;
      } else {
        const [created] = await db
          .insert(usersTable)
          .values({
            orgId: null,
            email: config.breakGlassEmail,
            fullName: config.breakGlassName,
            role: "Super_Admin",
            status: "Active",
            passwordHash: await hashPassword(config.breakGlassPassword),
            mustChangePassword: false,
          })
          .returning();
        breakGlassId = created!.id;
        breakGlassCreated = true;
        await recordAudit(db, {
          orgId: null,
          actorUserId: null,
          action: "platform.breakglass_created",
          targetType: "user",
          targetId: created!.id,
          details: { email: config.breakGlassEmail },
        });
        logger.warn(
          { email: config.breakGlassEmail },
          "Break-glass provider account created — store its password where the primary account's holder cannot lose both"
        );
      }
    }
  }

  return {
    platformRowsAdded,
    orgId: org!.id,
    orgCreated,
    superAdminId: admin?.id ?? null,
    superAdminCreated,
    superAdminSetupRequired,
    superAdminSetupProblem,
    legacyPasswordAccountsFlagged,
    breakGlassId,
    breakGlassCreated,
    requirementsSeeded,
    leadDefaultsChecked,
    consultationsImported,
  };
}
