// app/admin/platform/features/page.tsx — tier 1 of the switchboard: which
// capabilities organizations may use at all.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { FeatureSwitchboard } from "@/components/admin/feature-switchboard";

export default async function PlatformFeaturesPage() {
  const { denied } = await checkAccess({ capability: "platform.features" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Feature switchboard"
        intro="Tier 1 of two. Making a capability available lets an organization's Admin switch it on for their roles; switching it off here removes it everywhere at once. Preview and in-development capabilities are safe to leave off until they are ready."
      />
      <FeatureSwitchboard />
    </div>
  );
}
