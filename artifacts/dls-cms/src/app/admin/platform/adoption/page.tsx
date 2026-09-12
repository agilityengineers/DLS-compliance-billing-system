// app/admin/platform/adoption/page.tsx — which organization has switched on
// what, and for which roles. Read-only.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { FeatureAdoptionMatrix } from "@/components/admin/platform/adoption-matrix";

export default async function PlatformAdoptionPage() {
  const { denied } = await checkAccess({ capability: "platform.view" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Feature adoption"
        intro="The catalog crossed with every organization: what you have made available, what each organization has actually switched on, and which roles got it. Change tier 1 on the switchboard; the organization's Admin changes tier 2 in their Settings."
      />
      <FeatureAdoptionMatrix />
    </div>
  );
}
