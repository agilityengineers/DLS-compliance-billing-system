// app/admin/platform/website/page.tsx — the public website's news feeds: which
// RSS feeds it streams in and the pages that show them.
import { checkAccess } from "@/lib/rbac/access";
import { PlatformPageHeader } from "@/components/admin/platform/page-header";
import { WebsiteFeedsPanel } from "@/components/admin/platform/website-feeds";

export default async function PlatformWebsitePage() {
  const { denied } = await checkAccess({ capability: "platform.website" });
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Website news feeds"
        intro="Add the RSS or Atom feeds the public website should stream in, then place them as news blocks on any page. The website reads the feeds through the portal every few minutes, so a change here shows on the site within a couple of minutes, without editing a page."
      />
      <WebsiteFeedsPanel />
    </div>
  );
}
