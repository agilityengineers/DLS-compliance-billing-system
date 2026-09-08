import { auditLogTable, type Db } from "@workspace/db";

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

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
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
