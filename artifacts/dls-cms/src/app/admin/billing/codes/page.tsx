// app/admin/billing/codes/page.tsx — the fee schedule and the payers it
// bills: what claims price from. Admin-only, behind billing.codes.
import Link from "next/link";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { BillingCodesPanel } from "@/components/admin/billing-codes-panel";

export default async function BillingCodesPage() {
  const { denied } = await checkAccess({ feature: "billing.codes", roles: ["Admin"] });
  if (denied) return denied;
  if (!isApiAuth()) return <p className="text-sm text-muted-foreground">Billing codes need the API server (real sign-in mode).</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/billing" className="text-sm text-plum hover:underline">← Billing</Link>
        <h1 className="page-title mt-1">Billing codes &amp; payers</h1>
        <p className="text-sm text-muted-foreground">
          The fee schedule claims price from. As soon as one code is here, it replaces the practice rates; end a rate with its end date rather than editing it, so old claims keep their meaning.
        </p>
      </div>
      <BillingCodesPanel />
    </div>
  );
}
