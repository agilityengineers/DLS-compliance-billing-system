// app/field/incident/page.tsx — mandatory abuse/neglect & critical-incident
// reporting (MVP workflow: draft → submit; Admin sees all reports).
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { listClients } from "@/lib/data/repo-core";
import { IncidentForm } from "@/components/field/incident-form";

export default async function IncidentPage() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  const clients = await listClients();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Report an incident</h1>
      <p className="rounded-card-m bg-pill-warning p-3 text-sm text-pill-warning-fg">
        Suspected abuse or neglect must ALSO be reported to the county department of human
        services and, where required, law enforcement — this form documents the internal report;
        it does not replace mandatory external reporting.
      </p>
      <IncidentForm clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }))} />
    </div>
  );
}
