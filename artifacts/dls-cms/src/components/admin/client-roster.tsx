// Client-side roster search: names and Medicaid IDs never enter a URL,
// browser history, Referer header, or server log.
"use client";

import { useMemo, useState } from "react";
import type { Client } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody } from "@/components/ui/table";

export function ClientRoster({ clients, today }: { clients: Client[]; today: string }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!needle) return clients;
    return clients.filter((client) =>
      `${client.last_name}, ${client.first_name}`.toLowerCase().includes(needle) ||
      `${client.first_name} ${client.last_name}`.toLowerCase().includes(needle) ||
      client.medicaid_id.toLowerCase().includes(needle)
    );
  }, [clients, needle]);

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Input
          type="search"
          autoComplete="off"
          aria-label="Search clients"
          placeholder="Search name or Medicaid ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <Table>
        <THead>
          <tr>
            <th>Name</th><th>Medicaid ID</th><th>Age</th><th>Diagnoses</th>
            <th>Authorization</th><th>Case manager / CCB</th><th>Plan window</th>
          </tr>
        </THead>
        <TBody>
          {rows.map((client) => {
            const planExpired = client.service_plan_end && client.service_plan_end < today;
            const authorization = [
              client.authorized_scc_hours_per_week > 0 && `SCC ${client.authorized_scc_hours_per_week}h`,
              client.authorized_jc_hours_per_week > 0 && `JC ${client.authorized_jc_hours_per_week}h`,
              client.authorized_dh_hours_per_week > 0 && `DH ${client.authorized_dh_hours_per_week}h`,
              client.authorized_nmt_trips_per_week > 0 && `NMT ${client.authorized_nmt_trips_per_week}/wk`,
            ].filter(Boolean).join(" · ");
            return (
              <tr key={client.id} className="hover:bg-muted/30">
                <td className="font-medium">{client.last_name}, {client.first_name}</td>
                <td className="tabular-nums text-plum-accent">{client.medicaid_id}</td>
                <td className="tabular-nums">{client.calculated_age}</td>
                <td>
                  <span title={client.active_diagnoses.map((d) => `${d.code} ${d.description}`).join("\n")}>
                    <Badge variant="muted">{client.active_diagnoses.length}</Badge>
                  </span>
                </td>
                <td className="text-sm">{authorization || "—"}</td>
                <td className="text-sm text-muted-foreground">
                  {client.case_manager_name ?? "—"}{client.ccb_name ? ` / ${client.ccb_name}` : ""}
                </td>
                <td>
                  {planExpired ? (
                    <Badge variant="destructive">Expired {client.service_plan_end}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {client.service_plan_start ?? "—"} → {client.service_plan_end ?? "—"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-muted-foreground">
                No clients{needle ? " matching your search" : ""}.
              </td>
            </tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}