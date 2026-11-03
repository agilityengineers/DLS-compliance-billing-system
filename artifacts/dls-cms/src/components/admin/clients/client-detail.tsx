// components/admin/clients/client-detail.tsx — one client: the record and the
// tabs that hang off it. Which tabs appear follows the feature switches; the
// page passes the set, so a capability the provider has not made available
// (or the Admin has not granted to this role) is simply not offered.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clientsApi, type ClientRecord } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientRecordForm } from "./client-record-form";
import { ClientContactsTab } from "./client-contacts-tab";
import { ClientInsuranceTab } from "./client-insurance-tab";
import { ClientAuthorizationsTab, type AuthorizationUsage } from "./client-authorizations-tab";
import { ClientFilesTab } from "./client-files-tab";
import { ClientHealthTab } from "./client-health-tab";
import { STATUS_VARIANT, clientName, formatDate } from "./format";

/** A delivered service, as the page could see it: enough to count usage against an authorization. */
export interface DeliveredService {
  date: string;
  service: "SCC" | "Job_Coaching" | "Day_Habilitation" | "Early_Intervention" | "NMT";
  /** 15-minute units for a visit; trips for NMT. */
  units: number;
}

export type ClientTab = "record" | "contacts" | "insurance" | "authorizations" | "files" | "health";

export function ClientDetail({
  id,
  tabs,
  isAdmin,
  today,
  delivered,
}: {
  id: string;
  /** The tabs this person may see, in order. */
  tabs: ClientTab[];
  isAdmin: boolean;
  today: string;
  delivered: DeliveredService[];
}) {
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    clientsApi
      .get(id)
      .then((r) => {
        if (!cancelled) setClient(r.client);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Usage against an authorization: the delivered services of the same kind
  // inside its period, in the authorization's own basis. Dollars cannot be
  // counted from units alone, so those read "not available".
  const usage = useMemo<AuthorizationUsage>(
    () => (auth) => {
      if (auth.service === "Other" || auth.unitBasis === "dollar") return null;
      const inPeriod = delivered.filter((d) => d.service === auth.service && d.date >= auth.startDate && d.date <= auth.endDate);
      const units = inPeriod.reduce((s, d) => s + d.units, 0);
      if (auth.service === "NMT") return auth.unitBasis === "trip" ? units : null;
      if (auth.unitBasis === "hour") return Math.round((units / 4) * 100) / 100;
      if (auth.unitBasis === "unit") return units;
      return null;
    },
    [delivered]
  );

  if (error && !client) {
    return (
      <div className="space-y-3">
        <Link href="/admin/clients" className="text-sm text-plum hover:underline">← Clients</Link>
        <p className="text-sm text-destructive" role="alert">{error}</p>
      </div>
    );
  }
  if (!client) return <p className="text-sm text-muted-foreground">Loading client…</p>;

  const labels: Record<ClientTab, string> = {
    record: "Record",
    contacts: "Contacts",
    insurance: "Insurance",
    authorizations: "Authorizations",
    files: "Files",
    health: "Health & support",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/clients" className="text-sm text-plum hover:underline">← Clients</Link>
          <h1 className="page-title mt-1">{clientName(client)}</h1>
          <p className="text-sm text-muted-foreground">
            {client.medicaidId ? `Medicaid ID ${client.medicaidId}` : "No Medicaid ID yet"}
            {client.dateOfBirth ? ` · born ${formatDate(client.dateOfBirth)}` : ""}
            {client.caseManagerName ? ` · case manager ${client.caseManagerName}` : ""}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[client.status] ?? "muted"}>{client.status}</Badge>
      </div>

      <Tabs defaultValue={tabs[0] ?? "record"}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t}>{labels[t]}</TabsTrigger>
          ))}
        </TabsList>
        {tabs.includes("record") && (
          <TabsContent value="record" className="mt-4">
            <ClientRecordForm key={client.updatedAt} client={client} isAdmin={isAdmin} onSaved={setClient} />
          </TabsContent>
        )}
        {tabs.includes("contacts") && (
          <TabsContent value="contacts" className="mt-4">
            <ClientContactsTab clientId={client.id} />
          </TabsContent>
        )}
        {tabs.includes("insurance") && (
          <TabsContent value="insurance" className="mt-4">
            <ClientInsuranceTab clientId={client.id} />
          </TabsContent>
        )}
        {tabs.includes("authorizations") && (
          <TabsContent value="authorizations" className="mt-4">
            <ClientAuthorizationsTab clientId={client.id} today={today} usage={usage} />
          </TabsContent>
        )}
        {tabs.includes("files") && (
          <TabsContent value="files" className="mt-4">
            <ClientFilesTab clientId={client.id} today={today} />
          </TabsContent>
        )}
        {tabs.includes("health") && (
          <TabsContent value="health" className="mt-4">
            <ClientHealthTab key={client.updatedAt} client={client} onSaved={setClient} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
