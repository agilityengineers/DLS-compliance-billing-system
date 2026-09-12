// lib/data/repo-credentialing.ts — the requirements registry and staff
// credential evidence.
//
// Same contract as the other repos: branch on demo mode, never let the UI
// touch a data client directly.
//
// PERSISTENCE. Demo mode keeps the registry in the in-memory store, which
// resets on restart. Real mode talks to the API server
// (artifacts/api-server/src/routes/credentialing.ts), which persists to the
// `requirements` and `staff_credentials` tables from
// lib/db/migrations/0001_credentialing.sql. There is no silent fallback to the
// shipped defaults any more: if the registry cannot be read, the caller is
// told, because quietly serving default policy to an agency that has edited
// theirs would mean billing decisions made against rules they never set.
import "server-only";

import { isDemoMode } from "@/lib/demo/mode";
import { getDemoStore, type AuditContext } from "@/lib/data/demo/store";
import {
  listRequirements as apiListRequirements,
  listStaffCredentials as apiListStaffCredentials,
  updateRequirement as apiUpdateRequirement,
  type Requirement as ApiRequirement
} from "@workspace/api-client-react";
import type { Requirement, StaffCredentialRecord, VerificationStatus } from "@workspace/credentialing";

/** The API's wire shape is the registry shape; narrow the open-ended fields. */
function fromApi(r: ApiRequirement): Requirement {
  return {
    ...r,
    source: r.source as Requirement["source"],
    verificationStatus: r.verificationStatus as VerificationStatus
  };
}

/** Registry rows, in display order. */
export async function listRequirements(): Promise<Requirement[]> {
  if (isDemoMode()) return [...getDemoStore().data.requirements];
  return (await apiListRequirements()).map(fromApi);
}

/** Credential evidence. Pass a staff id to narrow; omit for the whole roster. */
export async function listStaffCredentials(staffId?: string): Promise<StaffCredentialRecord[]> {
  if (isDemoMode()) {
    const rows = getDemoStore().data.staffCredentials;
    return staffId ? rows.filter((r) => r.staff_id === staffId) : [...rows];
  }
  const rows = await apiListStaffCredentials(staffId ? { staffId } : undefined);
  return rows.map((r) => ({
    ...r,
    status: r.status as StaffCredentialRecord["status"]
  }));
}

export interface RequirementPatch {
  required?: boolean;
  gating?: boolean;
  verificationStatus?: VerificationStatus;
  verifiedOn?: string | null;
  verifiedBy?: string | null;
  verificationNote?: string | null;
}

/**
 * Change one requirement's policy switches or its verification record.
 *
 * `required` and `gating` decide what every staff checklist contains and what
 * blocks activation and billing; the verification fields record who checked
 * the requirement's legal basis. Both are audited.
 */
export async function updateRequirement(
  requirementId: string,
  patch: RequirementPatch,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  // A sign-off without a signer or a date is not a sign-off. Checked here, by
  // the API, and by a CHECK constraint — the UI should never be the only guard.
  if (patch.verificationStatus === "confirmed" && (!patch.verifiedOn || !patch.verifiedBy)) {
    return { ok: false, error: "Confirming a requirement needs both who verified it and the date." };
  }

  if (isDemoMode()) {
    const store = getDemoStore();
    const row = store.data.requirements.find((r) => r.id === requirementId);
    if (!row) return { ok: false, error: "Requirement not found." };
    const before = {
      required: row.required, gating: row.gating, verificationStatus: row.verificationStatus
    };
    if (patch.required !== undefined) row.required = patch.required;
    if (patch.gating !== undefined) row.gating = patch.gating;
    // An item that is not required cannot gate anything — keep the pair
    // coherent rather than leaving a gating row nobody has to hold.
    if (!row.required) row.gating = false;
    if (patch.verificationStatus !== undefined) row.verificationStatus = patch.verificationStatus;
    if (patch.verifiedOn !== undefined) row.verifiedOn = patch.verifiedOn;
    if (patch.verifiedBy !== undefined) row.verifiedBy = patch.verifiedBy;
    if (patch.verificationNote !== undefined) row.verificationNote = patch.verificationNote;
    store.audit("requirements", "UPDATE", requirementId, before, {
      required: row.required, gating: row.gating, verificationStatus: row.verificationStatus
    }, ctx);
    return { ok: true };
  }

  try {
    await apiUpdateRequirement(requirementId, patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the requirement." };
  }
}
