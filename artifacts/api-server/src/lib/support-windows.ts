// Reading and writing support windows. The rules live in support-access.ts;
// this is the database side of them.
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { organizationsTable, supportWindowsTable, usersTable, type Db, type SupportWindowRow } from "@workspace/db";

export interface SupportWindowView {
  id: string;
  orgId: string;
  orgName: string | null;
  grantedByUserId: string;
  grantedByName: string | null;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  createdAt: string;
  active: boolean;
}

function toView(
  row: SupportWindowRow,
  names: Map<string, string>,
  orgs: Map<string, string>,
  now: Date
): SupportWindowView {
  return {
    id: row.id,
    orgId: row.orgId,
    orgName: orgs.get(row.orgId) ?? null,
    grantedByUserId: row.grantedByUserId,
    grantedByName: names.get(row.grantedByUserId) ?? null,
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedByName: row.revokedByUserId ? names.get(row.revokedByUserId) ?? null : null,
    createdAt: row.createdAt.toISOString(),
    active: row.revokedAt === null && row.expiresAt.getTime() > now.getTime(),
  };
}

async function decorate(db: Db, rows: SupportWindowRow[], now: Date): Promise<SupportWindowView[]> {
  if (rows.length === 0) return [];
  const [people, orgs] = await Promise.all([
    db.select({ id: usersTable.id, fullName: usersTable.fullName }).from(usersTable),
    db.select({ id: organizationsTable.id, name: organizationsTable.name }).from(organizationsTable),
  ]);
  const names = new Map(people.map((p) => [p.id, p.fullName]));
  const orgNames = new Map(orgs.map((o) => [o.id, o.name]));
  return rows.map((r) => toView(r, names, orgNames, now));
}

/** Raw rows still open for an organization — what the impersonation gate reads. */
export async function activeWindowRows(db: Db, orgId: string, now: Date = new Date()): Promise<SupportWindowRow[]> {
  return db
    .select()
    .from(supportWindowsTable)
    .where(
      and(
        eq(supportWindowsTable.orgId, orgId),
        isNull(supportWindowsTable.revokedAt),
        gt(supportWindowsTable.expiresAt, now)
      )
    )
    .orderBy(desc(supportWindowsTable.expiresAt));
}

export async function listWindowsForOrg(db: Db, orgId: string, limit = 50): Promise<SupportWindowView[]> {
  const rows = await db
    .select()
    .from(supportWindowsTable)
    .where(eq(supportWindowsTable.orgId, orgId))
    .orderBy(desc(supportWindowsTable.createdAt))
    .limit(limit);
  return decorate(db, rows, new Date());
}

export async function listAllWindows(db: Db, limit = 100): Promise<SupportWindowView[]> {
  const rows = await db.select().from(supportWindowsTable).orderBy(desc(supportWindowsTable.createdAt)).limit(limit);
  return decorate(db, rows, new Date());
}

export async function grantWindow(
  db: Db,
  input: { orgId: string; grantedByUserId: string; reason: string; expiresAt: Date }
): Promise<SupportWindowRow> {
  const [row] = await db
    .insert(supportWindowsTable)
    .values({
      orgId: input.orgId,
      grantedByUserId: input.grantedByUserId,
      reason: input.reason,
      expiresAt: input.expiresAt,
    })
    .returning();
  return row!;
}

export async function revokeWindow(db: Db, id: string, revokedByUserId: string): Promise<SupportWindowRow | undefined> {
  const [row] = await db
    .update(supportWindowsTable)
    .set({ revokedAt: new Date(), revokedByUserId })
    .where(and(eq(supportWindowsTable.id, id), isNull(supportWindowsTable.revokedAt)))
    .returning();
  return row;
}

export async function findWindow(db: Db, id: string): Promise<SupportWindowRow | undefined> {
  const rows = await db.select().from(supportWindowsTable).where(eq(supportWindowsTable.id, id)).limit(1);
  return rows[0];
}
