// app/admin/platform/support/page.tsx — audited "view as" support sessions:
// the policy, start one, the ones running, and the full history.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { SupportAccessPanel } from "@/components/admin/platform/support-access";

export default async function PlatformSupportPage() {
  const { ctx, denied } = await checkAccess({ capability: "platform.support" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Support access"
        intro="The provider has no screens of its own into client records: the only way in is an audited session as one of the organization's people. Open one when they need help, do what is needed, and exit. Everything you do is logged under your own name; if this deployment requires it, the organization's Admin opens a support window first."
      />
      <SupportAccessPanel selfId={ctx.realUser!.id} />
    </div>
  );
}
