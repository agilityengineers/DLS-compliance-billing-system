// app/admin/requirements/actions.ts — credentialing registry writes (Admin-only).
//
// Two kinds of change land here, and they are deliberately separate:
//
//   POLICY       — `required` / `gating`. What every staff checklist contains
//                  and what blocks activation and billing.
//   PROVENANCE   — the verification record. Who checked this requirement's
//                  legal basis against the primary source, and when.
//
// Both are audited. The sign-off is attributed to the REAL user, never the
// impersonation target: a compliance record has to name the person who
// actually made it.
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { updateRequirement } from "@/lib/data/repo-credentialing";
import { agencyTodayIso } from "@/lib/time/agency";

const ToggleSchema = z.object({
  requirementId: z.string().min(1),
  required: z.boolean().optional(),
  gating: z.boolean().optional()
});

function refresh() {
  // Claim readiness, the staff roster and the registry all read these rows.
  revalidatePath("/admin/requirements");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/billing");
}

export async function saveRequirementToggles(input: unknown) {
  const ctx = await requireRole("Admin");
  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid requirement toggle." };
  const { requirementId, ...patch } = parsed.data;
  const res = await updateRequirement(requirementId, patch, ctx.auditCtx);
  refresh();
  return res;
}

const VerifySchema = z.object({
  requirementId: z.string().min(1),
  note: z.string().trim().min(1, "Say what was checked.")
});

/**
 * Record that a named person checked this requirement against the primary
 * source. This is what moves a row off the "needs review" list — it is a
 * claim about the world, so it carries who and when.
 */
export async function confirmRequirement(input: unknown) {
  const ctx = await requireRole("Admin");
  const parsed = VerifySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const signer = ctx.realUser;
  if (!signer) return { ok: false as const, error: "No signed-in user to attribute this to." };

  const res = await updateRequirement(
    parsed.data.requirementId,
    {
      verificationStatus: "confirmed",
      verifiedOn: agencyTodayIso(),
      verifiedBy: signer.full_name,
      verificationNote: parsed.data.note
    },
    ctx.auditCtx
  );
  refresh();
  return res;
}
