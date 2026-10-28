// app/admin/leads/page.tsx — the inbox: every inquiry the organization has
// received, from first contact to becoming a client. Gated on the Leads &
// inquiries capability: Admins always, Schedulers when granted.
import Link from "next/link";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { LeadsInbox } from "@/components/admin/leads/leads-inbox";

export default async function LeadsPage() {
  const { ctx, denied } = await checkAccess({ feature: "leads.inbox" });
  if (denied) return denied;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Inquiries from the website and by phone, and the path each one takes to becoming a client of {ctx.org?.name ?? "your organization"}.
          </p>
        </div>
        {ctx.effectiveUser?.role === "Admin" && (
          <Link href="/admin/leads/form" className="text-sm text-plum hover:underline">
            Form &amp; funnel settings
          </Link>
        )}
      </div>
      {isApiAuth() ? (
        <LeadsInbox />
      ) : (
        <p className="text-sm text-muted-foreground">The leads inbox needs the API server (real sign-in mode).</p>
      )}
    </div>
  );
}
