import { and, eq } from "drizzle-orm";
import {
  orgFeaturesTable,
  platformFeaturesTable,
  platformOrgFeaturesTable,
  type Db,
  type OrgFeatureRow,
  type PlatformFeatureRow,
  type PlatformOrgFeatureRow,
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

/** The provider's per-organization overrides of tier 1 for one organization. */
export async function loadOrgPlatformRows(db: Db, orgId: string): Promise<PlatformOrgFeatureRow[]> {
  return db.select().from(platformOrgFeaturesTable).where(eq(platformOrgFeaturesTable.orgId, orgId));
}

/**
 * Both tiers merged with the catalog defaults. `orgId = null` yields the
 * provider's own view (tier 1 only, global switches), which is what a Super
 * Admin sees. For an organization, tier 1 is the global switch unless the
 * provider overrode it for that organization.
 */
export async function loadFeatureStates(db: Db, orgId: string | null): Promise<FeatureState[]> {
  const [platform, org, overrides] = await Promise.all([
    loadPlatformRows(db),
    orgId ? loadOrgRows(db, orgId) : Promise.resolve([]),
    orgId ? loadOrgPlatformRows(db, orgId) : Promise.resolve([]),
  ]);
  return resolveFeatureStates(platform, org, overrides);
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

/**
 * Tier 1 for one organization. `enabled` true or false overrides the global
 * switch for that organization; null removes the override so the
 * organization follows the global switch again.
 */
export async function setOrgPlatformFeature(
  db: Db,
  orgId: string,
  key: FeatureKey,
  enabled: boolean | null,
  actorId: string
): Promise<void> {
  if (enabled === null) {
    await db.delete(platformOrgFeaturesTable).where(and(eq(platformOrgFeaturesTable.orgId, orgId), eq(platformOrgFeaturesTable.key, key)));
    return;
  }
  await db
    .insert(platformOrgFeaturesTable)
    .values({ orgId, key, enabled, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [platformOrgFeaturesTable.orgId, platformOrgFeaturesTable.key],
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
