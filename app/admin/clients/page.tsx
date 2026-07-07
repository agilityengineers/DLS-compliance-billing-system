// app/admin/clients/page.tsx — client roster: search + table (name, Medicaid
// ID, age, diagnoses, authorization, case manager/CCB).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { listClients } from "@/lib/data/repo-core";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody } from "@/components/ui/table";

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string } }) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  const q = searchParams.q?.trim() ?? "";
  const clients = await listClients(q || undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Clients</h1>
        <Link
          href="/admin/clients/new"
          className="inline-flex h-10 items-center justify-center rounded-btn bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          New client
        </Link>
      </div>

      <form className="max-w-sm">
        <Input name="q" defaultValue={q} placeholder="Search name or Medicaid ID…" />
      </form>

      <Table>
        <THead>
          <tr>
            <th>Name</th><th>Medicaid ID</th><th>Age</th><th>Diagnoses</th>
            <th>Authorization</th><th>Case manager / CCB</th><th>Plan window</th>
          </tr>
        </THead>
        <TBody>
          {clients.map((c) => {
            const planExpired = c.service_plan_end && c.service_plan_end < today;
            const auth = [
              c.authorized_scc_hours_per_week > 0 && `SCC ${c.authorized_scc_hours_per_week}h`,
              c.authorized_jc_hours_per_week > 0 && `JC ${c.authorized_jc_hours_per_week}h`,
              c.authorized_dh_hours_per_week > 0 && `DH ${c.authorized_dh_hours_per_week}h`,
              c.authorized_nmt_trips_per_week > 0 && `NMT ${c.authorized_nmt_trips_per_week}/wk`
            ].filter(Boolean).join(" · ");
            return (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="font-medium">{c.last_name}, {c.first_name}</td>
                <td className="tabular-nums text-plum-accent">{c.medicaid_id}</td>
                <td className="tabular-nums">{c.calculated_age}</td>
                <td>
                  <span title={c.active_diagnoses.map((d) => `${d.code} ${d.description}`).join("\n")}>
                    <Badge variant="muted">{c.active_diagnoses.length}</Badge>
                  </span>
                </td>
                <td className="text-sm">{auth || "—"}</td>
                <td className="text-sm text-muted-foreground">
                  {c.case_manager_name ?? "—"}{c.ccb_name ? ` / ${c.ccb_name}` : ""}
                </td>
                <td>
                  {planExpired ? (
                    <Badge variant="destructive">Expired {c.service_plan_end}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {c.service_plan_start ?? "—"} → {c.service_plan_end ?? "—"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {clients.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No clients{q ? ` matching “${q}”` : ""}.</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
