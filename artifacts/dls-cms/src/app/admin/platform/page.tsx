// app/admin/platform/page.tsx — the PROVIDER's console (Super Admin only).
//
// Tier 1 of the switchboard lives here: which capabilities each organization
// may use. The organization's own Admin turns them on for their people
// (tier 2, Settings → Feature access). The provider also creates
// organizations and their administrators, and can start an audited
// "view as" support session. No client records are loaded on this screen.
import { checkAccess } from "@/lib/rbac/access";
import { FeatureSwitchboard } from "@/components/admin/feature-switchboard";
import { OrganizationsPanel } from "@/components/admin/organizations-panel";
import { ConfigAudit } from "@/components/admin/config-audit";

export default async function PlatformConsolePage() {
  const { ctx, denied } = await checkAccess({ roles: ["Super_Admin"] });
  if (denied) return denied;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Platform console</h1>
        <p className="text-sm text-muted-foreground">
          Provider tools for Durable Life Skills and any future organization: what is available, who
          administers each organization, and a record of every configuration change. Client records
          are never shown here.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Feature switchboard</h2>
          <p className="text-sm text-muted-foreground">
            Tier 1 of two. Making a capability available lets an organization&rsquo;s Admin switch it on
            for their roles; switching it off here removes it everywhere at once.
          </p>
        </div>
        <FeatureSwitchboard />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Organizations &amp; administrators</h2>
          <p className="text-sm text-muted-foreground">
            Create the organization&rsquo;s Admin here; that Admin creates their own employees from
            Settings &rarr; Accounts.
          </p>
        </div>
        <OrganizationsPanel selfId={ctx.realUser!.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-plum">Configuration audit</h2>
        <ConfigAudit scope="platform" />
      </section>
    </div>
  );
}
