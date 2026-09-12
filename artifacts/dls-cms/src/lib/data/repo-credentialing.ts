// lib/data/repo-credentialing.ts — the requirements registry and staff
// credential evidence.
//
// Same contract as the other repos: branch on demo mode, never let the UI
// touch a data client directly.
//
// PERSISTENCE. The tables are defined for the migration target in
// lib/db/src/schema/requirements.ts and staff-credentials.ts. Until that
// migration runs, real mode falls back to the shipped default registry — the
// same fallback getMenuConfig() uses for menu_config, and a safe one, because
// the default registry is a working policy rather than an empty one. Writes
// fail loudly instead of silently doing nothing.
import "server-only";

import { isDemoMode } from "@/lib/demo/mode";
import { getDemoStore, type AuditContext } from "@/lib/data/demo/store";
import { createDataClient } from "@/lib/supabase/server";
import { DEFAULT_REQUIREMENTS } from "@/lib/credentialing/defaults";
import type { Requirement, StaffCredentialRecord } from "@/lib/credentialing/registry";

/** Registry rows, in display order. Falls back to the shipped defaults. */
export async function listRequirements(): Promise<Requirement[]> {
  if (isDemoMode()) return [...getDemoStore().data.requirements];
  const { data, error } = await createDataClient().from("requirements").select("*").order("sort_order");
  if (error || !data || data.length === 0) return DEFAULT_REQUIREMENTS.map((r) => ({ ...r }));
  return (data as Record<string, unknown>[]).map(mapRequirementRow);
}

/** Credential evidence. Pass a staff id to narrow; omit for the whole roster. */
export async function listStaffCredentials(staffId?: string): Promise<StaffCredentialRecord[]> {
  if (isDemoMode()) {
    const rows = getDemoStore().data.staffCredentials;
    return staffId ? rows.filter((r) => r.staff_id === staffId) : [...rows];
  }
  let q = createDataClient().from("staff_credentials").select("*");
  if (staffId) q = q.eq("staff_id", staffId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as StaffCredentialRecord[];
}

/**
 * Flip the `required` / `gating` toggles on one requirement.
 *
 * These two switches decide which items appear on every staff checklist and
 * which block activation and claims, so each change is audited.
 */
export async function setRequirementToggles(
  requirementId: string,
  toggles: { required?: boolean; gating?: boolean },
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const row = store.data.requirements.find((r) => r.id === requirementId);
    if (!row) return { ok: false, error: "Requirement not found." };
    const before = { required: row.required, gating: row.gating };
    if (toggles.required !== undefined) row.required = toggles.required;
    // An item that is not required cannot gate anything — keep the pair
    // coherent rather than leaving a gating row nobody has to hold.
    if (toggles.gating !== undefined) row.gating = toggles.gating;
    if (!row.required) row.gating = false;
    store.audit("requirements", "UPDATE", requirementId, before, { required: row.required, gating: row.gating }, ctx);
    return { ok: true };
  }

  const patch: Record<string, boolean> = {};
  if (toggles.required !== undefined) patch.required = toggles.required;
  if (toggles.gating !== undefined) patch.gating = toggles.gating;
  if (patch.required === false) patch.gating = false;
  const { error } = await createDataClient().from("requirements").update(patch).eq("id", requirementId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** snake_case row → the camelCase shape the engine works in. */
function mapRequirementRow(row: Record<string, unknown>): Requirement {
  return {
    id: String(row.id),
    label: String(row.label),
    category: String(row.category),
    required: Boolean(row.required),
    gating: Boolean(row.gating),
    automated: Boolean(row.automated),
    vendor: (row.vendor as string | null) ?? null,
    appliesTo: (row.applies_to as Requirement["appliesTo"]) ?? [],
    renewsMonths: (row.renews_months as number | null) ?? null,
    source: row.source as Requirement["source"],
    note: (row.note as string | null) ?? "",
    sortOrder: Number(row.sort_order ?? 0)
  };
}
