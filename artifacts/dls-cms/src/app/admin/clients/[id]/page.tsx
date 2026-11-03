// app/admin/clients/[id]/page.tsx — one client. The tabs follow the feature
// switches: the record itself rides clients.core, each other part its own
// key, so what the provider has made available and the Admin has granted to
// this role is exactly what is offered here.
import type { PageProps } from "@/components/async-route";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { listNotes } from "@/lib/data/repo-field";
import { ClientDetail, type ClientTab, type DeliveredService } from "@/components/admin/clients/client-detail";
import { agencyTodayIso } from "@workspace/time";

export default async function ClientDetailPage(props: PageProps) {
  const { ctx, denied } = await checkAccess({ feature: "clients.core" });
  if (denied) return denied;
  if (!isApiAuth()) return <p className="text-sm text-muted-foreground">Client records need the API server (real sign-in mode).</p>;
  const id = props.params?.id ?? "";

  const tabs: ClientTab[] = ["record"];
  if (ctx.features.has("clients.contacts")) tabs.push("contacts");
  if (ctx.features.has("clients.insurance")) tabs.push("insurance");
  if (ctx.features.has("clients.authorizations")) tabs.push("authorizations");
  if (ctx.features.has("clients.paperwork")) tabs.push("files");
  if (ctx.features.has("clients.health")) tabs.push("health");

  // What has been delivered to this client, for the authorization meters:
  // every note the app can see, cancelled ones aside. Notes still live in the
  // practice dataset for now, so this is empty for a brand-new record.
  let delivered: DeliveredService[] = [];
  if (tabs.includes("authorizations")) {
    const notes = await listNotes({ clientId: id, limit: null });
    delivered = notes
      .filter((n) => !n.cancellation_reason)
      .map((n) => ({ date: n.date, service: (n.visit_type ?? "SCC") as DeliveredService["service"], units: n.calculated_billing_units ?? 0 }));
  }

  return <ClientDetail id={id} tabs={tabs} isAdmin={ctx.effectiveUser!.role === "Admin"} today={agencyTodayIso()} delivered={delivered} />;
}
