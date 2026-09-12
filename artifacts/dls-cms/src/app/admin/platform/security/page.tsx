// app/admin/platform/security/page.tsx — the provider's own security posture:
// second factor, provider accounts, support windows and failed sign-ins.
import { hasPlatformCapability } from "@workspace/features";
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { SecurityPanel } from "@/components/admin/platform/security-panel";

export default async function PlatformSecurityPage() {
  const { ctx, denied } = await checkAccess({ capability: "platform.view" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Security"
        intro="Who holds a key to the platform, how well it is protected, which organizations have opened a door, and what is being thrown at the sign-in page."
      />
      <SecurityPanel
        selfId={ctx.realUser!.id}
        mfa={ctx.mfa}
        canCutKeys={hasPlatformCapability(ctx.effectiveUser!.role, "platform.provider_accounts")}
      />
    </div>
  );
}
