"use server";

import { requireSession } from "@/lib/auth/session";
import { createIncident } from "@/lib/data/repo-business";
import type { IncidentType } from "@/lib/supabase/types";

export async function submitIncident(input: {
  clientId: string | null;
  incidentType: IncidentType;
  description: string;
  immediateAction: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireSession();
  return createIncident(
    {
      client_id: input.clientId,
      reported_by: ctx.effectiveUser!.id,
      incident_type: input.incidentType,
      occurred_at: new Date().toISOString(),
      description: input.description,
      immediate_action: input.immediateAction,
      status: "submitted",
      submitted_at: new Date().toISOString()
    },
    ctx.auditCtx
  );
}
