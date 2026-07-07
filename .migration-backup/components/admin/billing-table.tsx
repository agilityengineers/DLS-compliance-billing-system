// components/admin/billing-table.tsx — selection + bulk 837P export.
// Blockers render as named red pills exactly as the prototype shows
// ("Missing client signature", "Staff license expired 06/15/26", …).
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody } from "@/components/ui/table";
import { bulkExport837P } from "@/app/admin/billing/actions";

export interface BillingRow {
  id: string;
  client: string;
  medicaidId: string;
  date: string;
  visitType: string;
  units: number;
  charge: number | null;
  ok: boolean;
  blockers: string[];
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

export function BillingTable({ rows }: { rows: BillingRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const readyRows = rows.filter((r) => r.ok);
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function onExport() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await bulkExport837P([...selected]);
    setBusy(false);
    if (!res.ok || !res.file) {
      setError(res.error ?? "Export failed.");
      return;
    }
    const blob = new Blob([res.file], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = res.fileName ?? `dls-837p-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setSuccess(`Exported ${res.exported} claim${res.exported === 1 ? "" : "s"} · control number ${res.controlNumber}. Notes marked billed.`);
    setSelected(new Set());
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(readyRows.map((r) => r.id)))}>
          Select all ready ({readyRows.length})
        </Button>
        <Button onClick={() => void onExport()} disabled={busy || selected.size === 0}>
          {busy ? "Exporting…" : `Export 837P (${selected.size})`}
        </Button>
        {error && <span className="text-sm text-destructive" role="alert">{error}</span>}
        {success && <span className="rounded-btn bg-pill-success px-3 py-1.5 text-sm text-pill-success-fg">{success}</span>}
      </div>

      <Table>
        <THead>
          <tr>
            <th className="w-8"></th><th>Client</th><th>Medicaid ID</th><th>Date</th><th>Type</th>
            <th className="text-right">Units</th><th className="text-right">Charge</th><th>Claim status</th>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input
                  type="checkbox" className="h-4 w-4 accent-[#5F7161]" disabled={!r.ok}
                  checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                  aria-label={`Select note for ${r.client}`}
                />
              </td>
              <td className="font-medium">{r.client}</td>
              <td className="tabular-nums text-plum-accent">{r.medicaidId}</td>
              <td className="tabular-nums">{fmtDate(r.date)}</td>
              <td>{r.visitType === "Job_Coaching" ? "Job Coaching" : r.visitType.replace(/_/g, " ")}</td>
              <td className="text-right tabular-nums">{r.units}</td>
              <td className="text-right tabular-nums">{r.charge != null ? `$${r.charge.toFixed(2)}` : "—"}</td>
              <td>
                {r.ok ? (
                  <Badge variant="success">Ready</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {r.blockers.map((b, i) => (
                      <Badge key={i} variant="destructive">{b.replace(/\.$/, "")}</Badge>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No unbilled notes.</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
