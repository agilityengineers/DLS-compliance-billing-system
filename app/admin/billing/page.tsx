// app/admin/billing/page.tsx — claim-ready notes with per-row guardrail output
import { requireRole } from "@/lib/rbac/roles";
import { createServiceClient } from "@/lib/supabase/server";
import { canGenerateClaim } from "@/lib/billing/guardrails";
import { BillingTable, type BillingRow } from "@/components/admin/billing-table";

export default async function BillingPage() {
  await requireRole("Admin"); // Schedulers have no access to billing exports
  const supabase = createServiceClient();

  const { data: notes } = await supabase
    .from("progress_notes")
    .select("id, date, calculated_billing_units, clients:client_id(first_name,last_name,medicaid_id), visits(visit_type,status)")
    .neq("visits.status", "Billed")
    .order("date", { ascending: false })
    .limit(100);

  const rows: BillingRow[] = await Promise.all(
    (notes ?? []).map(async (n) => {
      const check = await canGenerateClaim(n.id);
      const c = n.clients as unknown as { first_name: string; last_name: string; medicaid_id: string } | null;
      const v = n.visits as unknown as { visit_type: string } | null;
      return {
        id: n.id,
        client: c ? `${c.last_name}, ${c.first_name}` : "—",
        medicaidId: c?.medicaid_id ?? "—",
        date: n.date,
        visitType: v?.visit_type ?? "—",
        units: n.calculated_billing_units ?? 0,
        ok: check.ok,
        blockers: check.blockers
      };
    })
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Billing — claim readiness</h1>
      <BillingTable rows={rows} />
    </div>
  );
}
