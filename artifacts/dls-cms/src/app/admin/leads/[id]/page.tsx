// app/admin/leads/[id]/page.tsx — one inquiry.
import type { PageProps } from "@/components/async-route";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { LeadDetailPanel } from "@/components/admin/leads/lead-detail-panel";

export default async function LeadDetailPage(props: PageProps) {
  const { ctx, denied } = await checkAccess({ feature: "leads.inbox" });
  if (denied) return denied;
  if (!isApiAuth()) return <p className="text-sm text-muted-foreground">The leads inbox needs the API server (real sign-in mode).</p>;
  return <LeadDetailPanel id={props.params?.id ?? ""} canConvert={ctx.features.has("clients.core")} />;
}
