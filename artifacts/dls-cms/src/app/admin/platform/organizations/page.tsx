// app/admin/platform/organizations/page.tsx — tenants: create an
// organization, hand it to its administrator, suspend or rename it.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { OrganizationsPanel } from "@/components/admin/organizations-panel";

export default async function PlatformOrganizationsPage() {
  const { ctx, denied } = await checkAccess({ roles: ["Super_Admin"] });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Organizations"
        intro="Each organization is a separate tenant with its own administrators, employees and feature settings. Create it, add its Admin, hand over the one-time password, and watch the hand-over complete."
      />
      <OrganizationsPanel selfId={ctx.realUser!.id} />
    </div>
  );
}
