// app/admin/platform/accounts/page.tsx — every sign-in on the platform.
// `?org=<id>` pre-filters to one organization (linked from its card).
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { PlatformAccountsPanel } from "@/components/admin/platform/accounts-panel";

export default async function PlatformAccountsPage({ searchParams }: { searchParams: { org?: string } }) {
  const { ctx, denied } = await checkAccess({ capability: "platform.view" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Accounts"
        intro="Every account across every organization. Find a person, change their role, issue a one-time password, sign them out everywhere, or suspend them. The hierarchy is re-checked by the API on every action."
      />
      <PlatformAccountsPanel selfId={ctx.realUser!.id} initialOrgId={searchParams?.org ?? ""} />
    </div>
  );
}
