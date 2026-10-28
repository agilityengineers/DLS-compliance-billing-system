// app/admin/leads/page.tsx — the inbox: every inquiry the organization has
// received, from first contact to becoming a client. Gated on the Leads &
// inquiries capability: Admins always, Schedulers when granted.
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { LeadsInbox } from "@/components/admin/leads/leads-inbox";

export default async function LeadsPage() {
  const { ctx, denied } = await checkAccess({ feature: "leads.inbox" });
  if (denied) return denied;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Inquiries from the website and by phone, and the path each one takes to becoming a client of {ctx.org?.name ?? "your organization"}.
        </p>
      </div>
      {isApiAuth() ? (
        <LeadsInbox />
      ) : (
        <p className="text-sm text-muted-foreground">The leads inbox needs the API server (real sign-in mode).</p>
      )}
    </div>
  );
}
