// app/admin/clients/page.tsx — client roster (name, Medicaid ID, age,
// diagnoses, authorization, case manager/CCB). Search runs in the browser
// (components/admin/client-roster.tsx) so PHI never travels in a URL.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { listClients } from "@/lib/data/repo-core";
import { ClientRoster } from "@/components/admin/client-roster";
import { agencyTodayIso } from "@/lib/time/agency";

export default async function ClientsPage() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  // The whole roster (paged, uncapped) so the in-browser search sees every client.
  const clients = await listClients(undefined, { limit: null });
  const today = agencyTodayIso();

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

      <ClientRoster clients={clients} today={today} />
    </div>
  );
}
