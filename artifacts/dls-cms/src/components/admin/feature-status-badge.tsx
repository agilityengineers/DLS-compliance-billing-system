import { FEATURE_STATUS_LABELS, type FeatureStatus } from "@workspace/features";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<FeatureStatus, "success" | "warning" | "muted"> = {
  ready: "success",
  preview: "warning",
  in_development: "muted",
};

export function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  return <Badge variant={VARIANT[status]}>{FEATURE_STATUS_LABELS[status]}</Badge>;
}
