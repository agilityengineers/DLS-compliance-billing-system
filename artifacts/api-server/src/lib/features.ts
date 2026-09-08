import { and, eq } from "drizzle-orm";
import {
  orgFeaturesTable,
  platformFeaturesTable,
  type Db,
  type OrgFeatureRow,
  type PlatformFeatureRow,
} from "@workspace/db";
import {
  FEATURE_CATALOG,
  resolveFeatureStates,
  type FeatureKey,
  type FeatureState,
  type RoleGrants,
} from "@workspace/features";

export async function loadPlatformRows(db: Db): Promise<PlatformFeatureRow[]> {
  return db.select().from(platformFeaturesTable);
}

export async function loadOrgRows(db: Db, orgId: string): Promise<OrgFeatureRow[]> {
  return db.select().from(orgFeaturesTable).where(eq(orgFeaturesTable.orgId, orgId));
}

/**
 * Both tiers merged with the catalog defaults. `orgId = null` yields the
 * provider's own view (tier 1 only), which is what a Super Admin sees.
 */
export async function loadFeatureStates(db: Db, orgId: string | null): Promise<FeatureState[]> {
  const [platform, org] = await Promise.all([loadPlatformRows(db), orgId ? loadOrgRows(db, orgId) : Promise.resolve([])]);
  return resolveFeatureStates(platform, org);
}

/** Make sure every catalog key has a tier-1 row (new keys default to the catalog's launch value). */
export async function ensurePlatformRows(db: Db): Promise<number> {
  const existing = new Set((await loadPlatformRows(db)).map((r) => r.key));
  const missing = FEATURE_CATALOG.filter((f) => !existing.has(f.key));
  if (missing.length === 0) return 0;
  await db
    .insert(platformFeaturesTable)
    .values(missing.map((f) => ({ key: f.key, enabled: f.launchDefault })))
    .onConflictDoNothing();
  return missing.length;
}

export async function setPlatformFeature(db: Db, key: FeatureKey, enabled: boolean, actorId: string): Promise<void> {
  await db
    .insert(platformFeaturesTable)
    .values({ key, enabled, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformFeaturesTable.key,
      set: { enabled, updatedBy: actorId, updatedAt: new Date() },
    });
}

export async function setOrgFeature(
  db: Db,
  orgId: string,
  key: FeatureKey,
  value: { enabled: boolean; roles: RoleGrants },
  actorId: string
): Promise<void> {
  const roles = value.roles as Record<string, boolean>;
  await db
    .insert(orgFeaturesTable)
    .values({ orgId, key, enabled: value.enabled, roles, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [orgFeaturesTable.orgId, orgFeaturesTable.key],
      set: { enabled: value.enabled, roles, updatedBy: actorId, updatedAt: new Date() },
    });
}

export async function getOrgFeatureRow(db: Db, orgId: string, key: FeatureKey): Promise<OrgFeatureRow | undefined> {
  const rows = await db
    .select()
    .from(orgFeaturesTable)
    .where(and(eq(orgFeaturesTable.orgId, orgId), eq(orgFeaturesTable.key, key)))
    .limit(1);
  return rows[0];
}
