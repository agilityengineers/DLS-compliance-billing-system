// components/admin/client-roster.tsx — roster table with an in-browser search
// box. Filtering runs on the rows already on the page, so a name or Medicaid
// ID never becomes part of a URL (review #24: no PHI in server logs, browser
// history or Referer headers). The server sends the whole roster once.
"use client";

import { useMemo, useState } from "react";
import type { Client } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody } from "@/components/ui/table";

export function ClientRoster({ clients, today }: { clients: Client[]; today: string }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!needle) return clients;
    return clients.filter(
      (c) =>
        `${c.last_name}, ${c.first_name}`.toLowerCase().includes(needle) ||
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(needle) ||
        c.medicaid_id.toLowerCase().includes(needle)
    );
  }, [clients, needle]);

  return (
    <div className="space-y-4">
      {/* Deliberately not a <form>: Enter must never submit the term anywhere. */}
      <div className="max-w-sm">
        <Input
          type="search"
          autoComplete="off"
          aria-label="Search clients"
          placeholder="Search name or Medicaid ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
          {rows.map((c) => {
            const planExpired = c.service_plan_end && c.service_plan_end < today;
            const auth = [
              c.authorized_scc_hours_per_week > 0 && `SCC ${c.authorized_scc_hours_per_week}h`,
              c.authorized_jc_hours_per_week > 0 && `JC ${c.authorized_jc_hours_per_week}h`,
              c.authorized_dh_hours_per_week > 0 && `DH ${c.authorized_dh_hours_per_week}h`,
              c.authorized_nmt_trips_per_week > 0 && `NMT ${c.authorized_nmt_trips_per_week}/wk`
            ].filter(Boolean).join(" · ");
            return (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="font-medium">{c.last_name}, {c.first_name}</td>
                <td className="tabular-nums text-plum-accent">{c.medicaid_id}</td>
                <td className="tabular-nums">{c.calculated_age}</td>
                <td>
                  <span title={c.active_diagnoses.map((d) => `${d.code} ${d.description}`).join("\n")}>
                    <Badge variant="muted">{c.active_diagnoses.length}</Badge>
                  </span>
                </td>
                <td className="text-sm">{auth || "—"}</td>
                <td className="text-sm text-muted-foreground">
                  {c.case_manager_name ?? "—"}{c.ccb_name ? ` / ${c.ccb_name}` : ""}
                </td>
                <td>
                  {planExpired ? (
                    <Badge variant="destructive">Expired {c.service_plan_end}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {c.service_plan_start ?? "—"} → {c.service_plan_end ?? "—"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-muted-foreground">
                No clients{needle ? ` matching “${q.trim()}”` : ""}.
              </td>
            </tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
