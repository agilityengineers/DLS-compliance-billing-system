import { auditLogTable, type DbOrTx } from "@workspace/db";

export interface AuditEntry {
  orgId: string | null;
  actorUserId: string | null;
  impersonatingUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Append one entry to the audit log.
 *
 * Most callers write it after their transaction has committed. A caller that
 * writes it inside a transaction — because the entry is the only record that
 * the transaction's work happened — makes it the LAST write before the commit:
 * the chain trigger takes a transaction-scoped advisory lock shared by every
 * audit writer, and a transaction that went on to wait for a row lock while
 * holding it would stall every other audit write behind it, or deadlock with
 * a transaction holding that row.
 */
export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogTable).values({
    orgId: entry.orgId,
    actorUserId: entry.actorUserId,
    impersonatingUserId: entry.impersonatingUserId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    details: entry.details ?? null,
    ip: entry.ip ?? null,
  });
}
