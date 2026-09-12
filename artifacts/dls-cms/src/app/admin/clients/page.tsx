// Client roster. Search stays in-browser so PHI never travels in a URL.
import Link from "next/link";
import { checkAccess } from "@/lib/rbac/access";
import { listClients } from "@/lib/data/repo-core";
import { ClientRoster } from "@/components/admin/client-roster";
import { agencyTodayIso } from "@workspace/time";

export default async function ClientsPage() {
  const { denied } = await checkAccess({ feature: "clients.core" });
  if (denied) return denied;
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
