// app/admin/billing/page.tsx — claim readiness with named blockers + bulk
// 837P export. ADMIN-ONLY workspace; the Scheduler sees a locked
// explanation card (README: "Billing visible but locked").
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { evaluateUnbilledNotes } from "@/lib/billing/readiness";
import { listClaimExports } from "@/lib/data/repo-business";
import { BillingTable, type BillingRow } from "@/components/admin/billing-table";
import { DesktopWorkspace } from "@/components/admin/desktop-workspace";

export default async function BillingPage() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");

  // Scheduler: visible but LOCKED, with an explanation (not a 500).
  if (ctx.effectiveUser.role !== "Admin") {
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

  const [readiness, exports] = await Promise.all([evaluateUnbilledNotes(), listClaimExports()]);

  const rows: BillingRow[] = readiness.map((r) => ({
    id: r.note.id,
    client: r.note.client_name.split(" ").reverse().join(", "),
    medicaidId: r.note.medicaid_id,
    date: r.note.date,
    visitType: r.note.visit_type,
    units: r.note.calculated_billing_units ?? 0,
    charge: r.charge,
    ok: r.ok,
    blockers: r.blockers
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Billing</h1>
        <p className="text-sm text-muted-foreground">Claim readiness · unbilled progress notes</p>
      </div>

      <DesktopWorkspace title="Billing">
        <BillingTable rows={rows} />

        {exports.length > 0 && (
          <section className="mt-8 space-y-2">
            <h2 className="font-serif text-lg font-semibold text-plum">Export history</h2>
            <ul className="divide-y divide-border rounded-card border border-border bg-card text-sm">
              {exports.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(e.exported_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="font-medium">CN {e.control_number}</span>
                  <span>{e.note_ids.length} note{e.note_ids.length === 1 ? "" : "s"}</span>
                  <span className="tabular-nums">{e.total_units} units</span>
                  <span className="tabular-nums font-medium">${e.total_charge.toFixed(2)}</span>
                  <span className="text-muted-foreground">{e.payer.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DesktopWorkspace>
    </div>
  );
}
