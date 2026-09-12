// app/admin/requirements/actions.ts — credentialing registry toggles (Admin-only).
//
// These two switches decide what every staff checklist contains and what blocks
// activation and billing, so the write is audited and Admin-gated like the rest
// of Settings.
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { setRequirementToggles } from "@/lib/data/repo-credentialing";

const ToggleSchema = z.object({
  requirementId: z.string().min(1),
  required: z.boolean().optional(),
  gating: z.boolean().optional()
});

export async function saveRequirementToggles(input: unknown) {
  const ctx = await requireRole("Admin");
  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid requirement toggle." };
  const { requirementId, ...toggles } = parsed.data;
  const res = await setRequirementToggles(requirementId, toggles, ctx.auditCtx);
  // Claim readiness and the staff roster both read the registry.
  revalidatePath("/admin/requirements");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/billing");
  return res;
}
