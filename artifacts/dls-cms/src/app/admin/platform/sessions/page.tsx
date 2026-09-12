// app/admin/platform/sessions/page.tsx — who is signed in right now.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { ActiveSessionsPanel } from "@/components/admin/platform/sessions-panel";

export default async function PlatformSessionsPage() {
  const { denied } = await checkAccess({ capability: "platform.view" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Active sessions"
        intro="Every live session across the platform, with the device and address it came from. End one session for a lost phone, or sign a person out everywhere when they leave."
      />
      <ActiveSessionsPanel />
    </div>
  );
}
