// Getting a new account into its owner's hands.
//
// Until now that meant reading a one-time password down the phone: fine for
// one agency with a dozen people, impossible for the second, and it left no
// way for someone to recover their own account at 9pm. An invitation is a
// single-use link instead, with the on-screen password kept as the fallback
// for when mail is not configured or the send fails — an administrator should
// never be stranded by the mail provider.
import { ROLE_LABELS, type Role } from "@workspace/features";
import type { Db, User } from "@workspace/db";
import type { AppConfig } from "./config";
import { issueAuthToken } from "./auth-tokens";
import { inviteEmail, passwordResetEmail, type Mailer } from "./mail";

export interface InviteResult {
  sentTo: string;
  expiresAt: string;
  /** What actually happened to the message — "logged" when mail is not configured. */
  status: string;
}

export async function sendInvite(
  db: Db,
  mailer: Mailer,
  config: AppConfig,
  input: { user: User; orgName: string; createdBy: string | null }
): Promise<InviteResult> {
  const { token, expiresAt } = await issueAuthToken(db, {
    userId: input.user.id,
    purpose: "invite",
    ttlMs: config.inviteTtlMs,
    createdBy: input.createdBy,
  });
  const result = await mailer.send(
    inviteEmail({
      fullName: input.user.fullName,
      orgName: input.orgName,
      roleLabel: ROLE_LABELS[(input.user.role as Role) ?? "Field_Staff"] ?? input.user.role,
      link: mailer.link(`/auth/set-password?token=${token}`),
      expiresAt,
    }),
    { to: input.user.email, userId: input.user.id, orgId: input.user.orgId }
  );
  return { sentTo: input.user.email, expiresAt: expiresAt.toISOString(), status: result.status };
}

export async function sendPasswordReset(
  db: Db,
  mailer: Mailer,
  config: AppConfig,
  input: { user: User; createdBy: string | null }
): Promise<InviteResult> {
  const { token, expiresAt } = await issueAuthToken(db, {
    userId: input.user.id,
    purpose: "password_reset",
    ttlMs: config.resetTtlMs,
    createdBy: input.createdBy,
  });
  const result = await mailer.send(
    passwordResetEmail({
      fullName: input.user.fullName,
      link: mailer.link(`/auth/set-password?token=${token}&reset=1`),
      expiresAt,
    }),
    { to: input.user.email, userId: input.user.id, orgId: input.user.orgId }
  );
  return { sentTo: input.user.email, expiresAt: expiresAt.toISOString(), status: result.status };
}
