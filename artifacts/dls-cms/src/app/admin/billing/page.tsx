// app/admin/billing/page.tsx — note posting: claim readiness with named
// blockers, filters, a preview of the file, the bulk 837P export, and the
// ledger of batches with what the payer said. ADMIN-ONLY workspace; the
// Scheduler sees a locked explanation card (README: "Billing visible but
// locked").
import Link from "next/link";
import { Lock } from "lucide-react";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { billingApi } from "@/lib/api/admin";
import { evaluateUnbilledNotes } from "@/lib/billing/readiness";
import { listClaimExports } from "@/lib/data/repo-business";
import { BillingTable, type BillingRow, type PayerOption } from "@/components/admin/billing-table";
import { ClaimLedger } from "@/components/admin/claim-ledger";
import { DesktopWorkspace } from "@/components/admin/desktop-workspace";

export default async function BillingPage() {
  const { ctx, denied } = await checkAccess({ roles: ["Admin", "Scheduler"] });
  if (denied) return denied;

  // Scheduler: visible but LOCKED, with an explanation (not a 500).
  if (ctx.effectiveUser!.role !== "Admin") {
    return (
      <div className="mx-auto max-w-lg space-y-4 pt-10">
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-plum-accent" />
          <h1 className="font-serif text-xl font-semibold text-plum">Billing is locked</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Claim readiness and 837P exports are an <strong>Admin-only</strong> workspace — billing
            actions carry financial and compliance weight, so they stay with the administrator
            role. If a note needs attention before export (missing signature, expired credential),
            you&rsquo;ll see it flagged in QA.
          </p>
        </div>
      </div>
    );
  }

  const gate = await checkAccess({ feature: "billing.claims", roles: ["Admin"] });
  if (gate.denied) return gate.denied;

  const codesOn = ctx.features.has("billing.codes");
  const ledgerIsReal = isApiAuth();
  const [readiness, exports, payers] = await Promise.all([
    evaluateUnbilledNotes(),
    listClaimExports(),
    codesOn && ledgerIsReal ? billingApi.payers.list().then((r) => r.payers.filter((p) => p.active)).catch(() => []) : Promise.resolve([]),
  ]);

  const rows: BillingRow[] = readiness.map((r) => ({
    id: r.note.id,
    clientId: r.note.client_id,
    client: r.note.client_name.split(" ").reverse().join(", "),
    medicaidId: r.note.medicaid_id,
    date: r.note.date,
    visitType: r.note.visit_type,
    units: r.note.calculated_billing_units ?? 0,
    charge: r.charge,
    ok: r.ok,
    blockers: r.blockers
  }));
  const payerOptions: PayerOption[] = payers.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="text-sm text-muted-foreground">Claim readiness · unbilled progress notes</p>
        </div>
        {codesOn && (
          <Link href="/admin/billing/codes" className="text-sm text-plum hover:underline">Billing codes &amp; payers →</Link>
        )}
      </div>

      <DesktopWorkspace title="Billing">
        <BillingTable rows={rows} payers={payerOptions} ledgerIsReal={ledgerIsReal} />
        <ClaimLedger exports={exports} canRecord={ledgerIsReal} />
      </DesktopWorkspace>
    </div>
  );
}
