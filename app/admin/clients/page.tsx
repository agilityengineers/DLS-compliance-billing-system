// app/admin/clients/page.tsx — client data table with server-side search
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient();
  const q = searchParams.q?.trim() ?? "";

  let query = supabase.from("v_clients").select("*").order("last_name").limit(100);
  if (q) query = query.or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,medicaid_id.ilike.%${q}%`);
  const { data: clients } = await query;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Clients</h1>
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
            <th>SCC hrs/wk</th><th>Plan window</th>
          </tr>
        </THead>
        <TBody>
          {(clients ?? []).map((c) => (
            <tr key={c.id} className="hover:bg-muted/30">
              <td className="font-medium">{c.last_name}, {c.first_name}</td>
              <td className="tabular-nums">{c.medicaid_id}</td>
              <td className="tabular-nums">{c.calculated_age}</td>
              <td><Badge variant="muted">{Array.isArray(c.active_diagnoses) ? c.active_diagnoses.length : 0}</Badge></td>
              <td className="tabular-nums">{c.authorized_scc_hours_per_week}</td>
              <td className="text-muted-foreground">{c.service_plan_start ?? "—"} → {c.service_plan_end ?? "—"}</td>
            </tr>
          ))}
          {(clients ?? []).length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No clients{q ? ` matching “${q}”` : ""}.</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
