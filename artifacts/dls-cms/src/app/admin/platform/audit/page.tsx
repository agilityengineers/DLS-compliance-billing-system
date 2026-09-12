// app/admin/platform/audit/page.tsx — the platform-wide configuration and
// sign-in audit log, filterable and exportable.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { AuditExplorer } from "@/components/admin/platform/audit-explorer";

export default async function PlatformAuditPage() {
  const { denied } = await checkAccess({ capability: "platform.audit" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Audit log"
        intro="Who did what, when, across the whole platform: sign-ins, switch flips, organization and account changes, password resets and view-as sessions. Filter it down or export it for the record."
      />
      <AuditExplorer />
    </div>
  );
}
