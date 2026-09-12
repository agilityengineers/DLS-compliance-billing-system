// app/admin/platform/support/page.tsx — audited "view as" support sessions:
// the policy, start one, the ones running, and the full history.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { SupportAccessPanel } from "@/components/admin/platform/support-access";

export default async function PlatformSupportPage() {
  const { ctx, denied } = await checkAccess({ roles: ["Super_Admin"] });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Support access"
        intro="The provider never has standing access to client records. When an organization needs help, open an audited session as one of its people, do what is needed, and exit. Everything you do is logged under your own name."
      />
      <SupportAccessPanel selfId={ctx.realUser!.id} />
    </div>
  );
}
