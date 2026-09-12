// app/admin/platform/page.tsx — the PROVIDER's landing screen (Super Admin
// only): what needs attention, activity this week, the numbers, and a map of
// the rest of the console. No client records are loaded on any provider
// screen; support happens through an audited "view as" session.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { PlatformOverviewPanel } from "@/components/admin/platform/overview";

export default async function PlatformConsolePage() {
  const { denied } = await checkAccess({ roles: ["Super_Admin"] });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Platform overview"
        intro="Provider tools for Durable Life Skills and any future organization. Start with what needs attention; every number links to the screen that explains it."
      />
      <PlatformOverviewPanel />
    </div>
  );
}
