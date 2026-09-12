// Single-use links: invitations, password resets, and the short-lived handle
// that carries a half-finished sign-in between the password and the code.
//
// The token in the link is random and is never stored — only its sha256, the
// same arrangement as the session cookie. A stolen database therefore yields
// no working links, and a link that has been used or has expired cannot be
// used again even by the person it was sent to.
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { authTokensTable, usersTable, type AuthTokenPurpose, type Db, type User } from "@workspace/db";
import { generateToken, hashToken } from "./session";

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Issue a token, replacing any unused one the account already holds for the
 * same purpose — a second "reset my password" must invalidate the first, or a
 * stale email keeps working after the person has recovered their account.
 */
export async function issueAuthToken(
  db: Db,
  input: { userId: string; purpose: AuthTokenPurpose; ttlMs: number; createdBy?: string | null }
): Promise<IssuedToken> {
  await db
    .delete(authTokensTable)
    .where(
      and(
        eq(authTokensTable.userId, input.userId),
        eq(authTokensTable.purpose, input.purpose),
        isNull(authTokensTable.usedAt)
      )
    );
  const token = generateToken();
  const expiresAt = new Date(Date.now() + input.ttlMs);
  await db.insert(authTokensTable).values({
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: hashToken(token),
    expiresAt,
    createdBy: input.createdBy ?? null,
  });
  return { token, expiresAt };
}

export interface RedeemedToken {
  tokenId: string;
  user: User;
}

async function loadToken(db: Db, purpose: AuthTokenPurpose, token: string) {
  const rows = await db
    .select({ token: authTokensTable, user: usersTable })
    .from(authTokensTable)
    .innerJoin(usersTable, eq(usersTable.id, authTokensTable.userId))
    .where(and(eq(authTokensTable.tokenHash, hashToken(token)), eq(authTokensTable.purpose, purpose)))
    .limit(1);
  return rows[0];
}

/** Is this link still good? Used by the set-password screen before it renders a form. */
export async function peekAuthToken(
  db: Db,
  purpose: AuthTokenPurpose,
  token: string
): Promise<{ ok: true; user: User } | { ok: false; reason: "unknown" | "used" | "expired" | "account_inactive" }> {
  const row = await loadToken(db, purpose, token);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.token.usedAt) return { ok: false, reason: "used" };
  if (row.token.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (row.user.status !== "Active") return { ok: false, reason: "account_inactive" };
  return { ok: true, user: row.user };
}

/**
 * Spend a token. The update is conditional on the token still being unused, so
 * two simultaneous clicks on the same link cannot both succeed.
 */
export async function redeemAuthToken(
  db: Db,
  purpose: AuthTokenPurpose,
  token: string
): Promise<RedeemedToken | null> {
  const peeked = await peekAuthToken(db, purpose, token);
  if (!peeked.ok) return null;
  const spent = await db
    .update(authTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokensTable.tokenHash, hashToken(token)), isNull(authTokensTable.usedAt)))
    .returning({ id: authTokensTable.id });
  const row = spent[0];
  if (!row) return null;
  return { tokenId: row.id, user: peeked.user };
}

/**
 * Housekeeping for the scheduler. Spent tokens are kept for a day so that
 * "this link has already been used" stays a precise message rather than
 * degrading to "unknown link"; after that neither is any use to anyone.
 */
export async function pruneAuthTokens(db: Db, now: Date = new Date()): Promise<number> {
  const usedCutoff = new Date(now.getTime() - 24 * 3_600_000);
  const removed = await db
    .delete(authTokensTable)
    .where(or(lt(authTokensTable.expiresAt, now), lt(authTokensTable.usedAt, usedCutoff)))
    .returning({ id: authTokensTable.id });
  return removed.length;
}
