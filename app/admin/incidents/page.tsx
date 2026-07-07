// app/admin/incidents/page.tsx — incident reports (abuse/neglect & critical
// incidents) submitted from the field.
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listIncidents } from "@/lib/data/repo-business";
import { getClient, getUser } from "@/lib/data/repo-core";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";

const TYPE_LABEL: Record<string, string> = {
  abuse_neglect: "Abuse / neglect",
  critical: "Critical incident",
  medication_error: "Medication error",
  injury: "Injury",
  other: "Other"
};

export default async function IncidentsPage() {
  try {
    await requireRole("Admin");
  } catch {
    redirect("/admin");
  }
  const incidents = await listIncidents();
  const names = new Map<string, string>();
  for (const i of incidents) {
    if (i.client_id && !names.has(i.client_id)) {
      const c = await getClient(i.client_id);
      if (c) names.set(i.client_id, `${c.last_name}, ${c.first_name}`);
    }
    if (!names.has(i.reported_by)) {
      const u = await getUser(i.reported_by);
      if (u) names.set(i.reported_by, u.full_name);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Incident reports</h1>
        <p className="text-sm text-muted-foreground">
          Internal reports — abuse/neglect suspicions also require mandatory external reporting
          (county human services / law enforcement).
        </p>
      </div>
      <Table>
        <THead>
          <tr><th>Occurred</th><th>Type</th><th>Client</th><th>Reported by</th><th>Description</th><th>Status</th></tr>
        </THead>
        <TBody>
          {incidents.map((i) => (
            <tr key={i.id}>
              <td className="whitespace-nowrap tabular-nums">{new Date(i.occurred_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td>
                <Badge variant={i.incident_type === "abuse_neglect" || i.incident_type === "critical" ? "destructive" : "warning"}>
                  {TYPE_LABEL[i.incident_type]}
                </Badge>
              </td>
              <td className="font-medium">{i.client_id ? names.get(i.client_id) ?? "—" : "—"}</td>
              <td>{names.get(i.reported_by) ?? "—"}</td>
              <td className="max-w-md truncate text-muted-foreground" title={i.description}>{i.description}</td>
              <td><Badge variant={i.status === "submitted" ? "success" : "muted"}>{i.status}</Badge></td>
            </tr>
          ))}
          {incidents.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No incident reports.</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
