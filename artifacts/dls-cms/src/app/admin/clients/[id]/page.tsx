// app/admin/clients/[id]/page.tsx — one client. The tabs follow the feature
// switches: the record itself rides clients.core, each other part its own
// key, so what the provider has made available and the Admin has granted to
// this role is exactly what is offered here.
import type { PageProps } from "@/components/async-route";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { listNotes } from "@/lib/data/repo-field";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoStore } from "@/lib/data/demo/store";
import { demoClientToSampleInput, invalidateClients, listClientRecords } from "@/lib/data/clients-api";
import { clientsApi } from "@/lib/api/admin";
import { errorMessage, isApiClientError } from "@/lib/api/client";
import Link from "next/link";
import { ClientDetail, type ClientTab, type DeliveredService } from "@/components/admin/clients/client-detail";
import { agencyTodayIso } from "@workspace/time";

export default async function ClientDetailPage(props: PageProps) {
  const { ctx, denied } = await checkAccess({ feature: "clients.core" });
  if (denied) return denied;
  if (!isApiAuth()) return <p className="text-sm text-muted-foreground">Client records need the API server (real sign-in mode).</p>;
  let id = props.params?.id ?? "";

  // A synthetic demo client has no database row, so none of the tabs below
  // could load it. Opening one copies it into the database as a PRACTICE
  // record (flagged by sample_key, shown as "Practice" everywhere) and shows
  // that copy, so it can be edited and tested like any other client. Opening
  // it again finds the same copy; the API never makes two.
  let records = await listClientRecords();
  let record = records.find((c) => c.id === id);
  if (!record && isDemoMode()) {
    const demo = getDemoStore().data.clients.find((c) => c.id === id);
    if (demo) {
      record = records.find((c) => c.sample_key === demo.id);
      if (!record) {
        try {
          const input = demoClientToSampleInput(demo);
          // The sample Medicaid ID may belong to a real client already; the
          // practice copy then goes without one rather than not opening.
          const res = await clientsApi.create(input).catch((e) => {
            if (isApiClientError(e, "MEDICAID_ID_TAKEN")) return clientsApi.create({ ...input, medicaidId: undefined });
            throw e;
          });
          invalidateClients();
          records = await listClientRecords();
          record = records.find((c) => c.id === res.client.id);
        } catch (e) {
          return (
            <div className="space-y-3">
              <Link href="/admin/clients" className="text-sm text-plum hover:underline">← Clients</Link>
              <p className="text-sm text-destructive" role="alert">
                Could not open practice client {demo.first_name} {demo.last_name}: {errorMessage(e)}
              </p>
            </div>
          );
        }
      }
      if (record) id = record.id;
    }
  }
  // Practice data hanging off a demo client (visits, notes) is keyed by the
  // demo client's id, which the copy keeps in sample_key.
  const dataClientId = record?.sample_key ?? id;

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
    const notes = await listNotes({ clientId: dataClientId, limit: null });
    delivered = notes
      .filter((n) => !n.cancellation_reason)
      .map((n) => ({ date: n.date, service: (n.visit_type ?? "SCC") as DeliveredService["service"], units: n.calculated_billing_units ?? 0 }));
  }

  return <ClientDetail id={id} tabs={tabs} isAdmin={ctx.effectiveUser!.role === "Admin"} today={agencyTodayIso()} delivered={delivered} />;
}
