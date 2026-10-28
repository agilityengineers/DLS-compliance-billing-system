// components/admin/leads/lead-stage-badge.tsx — a stage as a pill. The colour
// follows what the stage MEANS (still open, became a client, closed), not its
// label, so a renamed stage keeps reading right.
"use client";

import { Badge } from "@/components/ui/badge";
import type { LeadStage, LeadStageKind } from "@/lib/api/admin";

export function stageVariant(kind: LeadStageKind): "default" | "success" | "muted" {
  if (kind === "won") return "success";
  if (kind === "lost") return "muted";
  return "default";
}

export function LeadStageBadge({ stage, fallback = "—" }: { stage: LeadStage | null | undefined; fallback?: string }) {
  if (!stage) return <Badge variant="muted">{fallback}</Badge>;
  return <Badge variant={stageVariant(stage.kind)}>{stage.label}</Badge>;
}
