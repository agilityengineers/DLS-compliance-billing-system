// Client-side roster search: names and Medicaid IDs never enter a URL,
// browser history, Referer header, or server log. The status filter and the
// spreadsheet export happen here too, for the same reason.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Client } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody } from "@/components/ui/table";

const STATUSES = ["Active", "Interim", "Inactive", "Discharged", "Deceased"] as const;
const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "destructive"> = {
  Active: "success",
  Interim: "warning",
  Inactive: "muted",
  Discharged: "muted",
  Deceased: "destructive",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The roster as a spreadsheet, built in the browser from what is already on screen. */
function toCsv(rows: Client[]): string {
  const header = ["Last name", "First name", "Middle name", "Status", "Medicaid ID", "Date of birth", "Age", "Phone", "Email", "City", "County", "Case manager", "CCB", "Service plan start", "Service plan end", "Diagnoses"];
  const lines = rows.map((c) =>
    [
      c.last_name,
      c.first_name,
      c.middle_name ?? "",
      c.status ?? "Active",
      c.medicaid_id,
      c.date_of_birth,
      c.calculated_age ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.city ?? "",
      c.county ?? "",
      c.case_manager_name ?? "",
      c.ccb_name ?? "",
      c.service_plan_start ?? "",
      c.service_plan_end ?? "",
      c.active_diagnoses.map((d) => d.code).join("; "),
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\r\n");
}

export function ClientRoster({ clients, today }: { clients: Client[]; today: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("Active");
  const needle = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const client of clients) c[client.status ?? "Active"] = (c[client.status ?? "Active"] ?? 0) + 1;
    return c;
  }, [clients]);

  const rows = useMemo(() => {
    let list = clients;
    if (status !== "all") list = list.filter((client) => (client.status ?? "Active") === status);
    if (needle) {
      list = list.filter(
        (client) =>
          `${client.last_name}, ${client.first_name}`.toLowerCase().includes(needle) ||
          `${client.first_name} ${client.last_name}`.toLowerCase().includes(needle) ||
          client.medicaid_id.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [clients, needle, status]);

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clients-${status === "all" ? "all" : status.toLowerCase()}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <Input
            type="search"
            autoComplete="off"
            aria-label="Search clients"
            placeholder="Search name or Medicaid ID…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          id="client-status-filter"
          aria-label="Filter by status"
          className="h-10 rounded-btn border border-border bg-card px-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses ({clients.length})</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          Export spreadsheet ({rows.length})
        </Button>
      </div>
      <Table>
        <THead>
          <tr>
            <th>Name</th><th>Status</th><th>Medicaid ID</th><th>Date of birth</th><th>Diagnoses</th>
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
            const name = `${client.last_name}, ${client.first_name}${client.middle_name ? ` ${client.middle_name[0]}.` : ""}`;
            return (
              <tr key={client.id} className="hover:bg-muted/30">
                <td className="font-medium">
                  {client.is_record ? (
                    <Link href={`/admin/clients/${client.id}`} className="text-plum hover:underline">{name}</Link>
                  ) : (
                    <span title="A practice record; it has no page of its own.">{name}</span>
                  )}
                </td>
                <td><Badge variant={STATUS_VARIANT[client.status ?? "Active"] ?? "muted"}>{client.status ?? "Active"}</Badge></td>
                <td className="tabular-nums text-plum-accent">{client.medicaid_id || "—"}</td>
                <td className="tabular-nums">
                  {fmtDate(client.date_of_birth)}
                  {client.calculated_age !== undefined && <span className="text-muted-foreground"> ({client.calculated_age})</span>}
                </td>
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
                    <Badge variant="destructive">Expired {fmtDate(client.service_plan_end)}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {fmtDate(client.service_plan_start)} → {fmtDate(client.service_plan_end)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="py-8 text-center text-muted-foreground">
                No {status === "all" ? "" : `${status.toLowerCase()} `}clients{needle ? " matching your search" : ""}.
              </td>
            </tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
