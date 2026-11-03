// app/admin/platform/adoption/page.tsx — which organization has switched on
// what, and for which roles. The Super Admin can also set tier 1 for ONE
// organization here, which is how a capability is turned on or off for a
// single account without touching the switchboard that every account follows.
import { hasPlatformCapability } from "@workspace/features";
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { FeatureAdoptionMatrix } from "@/components/admin/platform/adoption-matrix";

export default async function PlatformAdoptionPage() {
  const { ctx, denied } = await checkAccess({ capability: "platform.view" });
  if (denied) return denied;
  const canSwitch = hasPlatformCapability(ctx.effectiveUser!.role, "platform.features");

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Feature adoption"
        intro={
          canSwitch
            ? "The catalog crossed with every organization: what is available to each, what each has actually switched on, and which roles got it. Every organization follows the switchboard unless you set a capability for that organization here; the organization's Admin changes tier 2 in their Settings."
            : "The catalog crossed with every organization: what the provider has made available to each, what each organization has actually switched on, and which roles got it."
        }
      />
      <FeatureAdoptionMatrix canSwitch={canSwitch} />
    </div>
  );
}
