// app/admin/platform/system/page.tsx — service, database, sign-in policy and
// configuration warnings, read from the running API server.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { SystemStatusPanel } from "@/components/admin/platform/system-status";

export default async function PlatformSystemPage() {
  const { denied } = await checkAccess({ capability: "platform.system" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="System status"
        intro="The service as it is actually running: process and build, database and migrations, the sign-in policy in force, and how the provider account was bootstrapped. Warnings here are configuration problems, not application bugs."
      />
      <SystemStatusPanel />
    </div>
  );
}
