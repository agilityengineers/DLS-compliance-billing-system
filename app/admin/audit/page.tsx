// app/admin/audit/page.tsx — read-only audit trail (grows with every PHI
// mutation via the DB trigger / demo store). Shows impersonation
// attribution: performed_by is ALWAYS the real identity.
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listAuditTrail } from "@/lib/data/repo-business";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";

export default async function AuditTrailPage({ searchParams }: { searchParams: { table?: string } }) {
  try {
    await requireRole("Admin");
  } catch {
    redirect("/admin");
  }
  const rows = await listAuditTrail({ table: searchParams.table, limit: 150 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Read-only. Every PHI mutation is logged automatically; impersonated actions record the
          admin&rsquo;s real identity plus the impersonated user. Signature images are redacted.
        </p>
      </div>

      <Table>
        <THead>
          <tr><th>When</th><th>Table</th><th>Action</th><th>Performed by</th><th>Impersonating</th><th>Change</th></tr>
        </THead>
        <TBody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                {new Date(a.timestamp).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </td>
              <td>{a.table_name}</td>
              <td>
                <Badge variant={a.action === "DELETE" ? "destructive" : a.action === "INSERT" ? "success" : "muted"}>
                  {a.action}
                </Badge>
              </td>
              <td className="font-medium">{a.performed_by_name ?? (a.performed_by ? a.performed_by.slice(0, 8) : "system")}</td>
              <td>
                {a.impersonating_name ? (
                  <Badge variant="warning">as {a.impersonating_name}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="max-w-md truncate text-xs text-muted-foreground" title={summarize(a.new_values ?? a.old_values)}>
                {summarize(a.new_values ?? a.old_values)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No audit entries yet.</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}

function summarize(values: Record<string, unknown> | null): string {
  if (!values) return "—";
  const keys = ["status", "event", "full_name", "destination", "medication_name", "cancellation_reason", "control_number"];
  const interesting = keys.filter((k) => values[k] != null).map((k) => `${k}=${String(values[k])}`);
  return interesting.length > 0 ? interesting.join(" · ") : Object.keys(values).slice(0, 6).join(", ");
}
