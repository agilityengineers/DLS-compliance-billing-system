// components/admin/billing-table.tsx — the note-posting screen: filters,
// selection, a preview of the file as it would go out, and the bulk 837P
// export. Blockers render as named red pills exactly as the prototype shows
// ("Missing client signature", "Staff license expired 06/15/26", …).
"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody } from "@/components/ui/table";
import { bulkExport837P, previewClaim837P } from "@/app/admin/billing/actions";
import { agencyTodayIso } from "@workspace/time";

export interface BillingRow {
  id: string;
  clientId: string;
  client: string;
  medicaidId: string;
  date: string;
  visitType: string;
  units: number;
  charge: number | null;
  ok: boolean;
  blockers: string[];
}

export interface PayerOption {
  id: string;
  name: string;
}

const SERVICE_LABEL: Record<string, string> = {
  SCC: "SCC",
  Job_Coaching: "Job Coaching",
  Day_Habilitation: "Day Habilitation",
  Early_Intervention: "Early Intervention",
};

const selectClass = "h-9 rounded-btn border border-border bg-card px-2 text-sm";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
}

export function BillingTable({ rows, payers = [], ledgerIsReal = false }: { rows: BillingRow[]; payers?: PayerOption[]; ledgerIsReal?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"export" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; notes: number; totalUnits: number; totalCharge: number } | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [payerId, setPayerId] = useState<string>("");

  // ── filters: month, client, service, status ─────────────────────────
  const [month, setMonth] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("all");
  const [service, setService] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "ready" | "blocked">("all");

  const months = useMemo(() => Array.from(new Set(rows.map((r) => r.date.slice(0, 7)))).sort().reverse(), [rows]);
  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.clientId, r.client);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const services = useMemo(() => Array.from(new Set(rows.map((r) => r.visitType))).sort(), [rows]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (month === "all" || r.date.startsWith(month)) &&
          (clientId === "all" || r.clientId === clientId) &&
          (service === "all" || r.visitType === service) &&
          (status === "all" || (status === "ready" ? r.ok : !r.ok))
      ),
    [rows, month, clientId, service, status]
  );
  const readyVisible = visible.filter((r) => r.ok);
  const selectedVisible = visible.filter((r) => selected.has(r.id));
  const selectedUnits = selectedVisible.reduce((s, r) => s + r.units, 0);
  const selectedCharge = selectedVisible.reduce((s, r) => s + (r.charge ?? 0), 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const options = () => ({ testMode, payerId: payerId || null });

  async function onPreview() {
    setBusy("preview");
    setError(null);
    setSuccess(null);
    const res = await previewClaim837P([...selected], options());
    setBusy(null);
    if (!res.ok || !res.preview) {
      setError(res.error ?? "Preview failed.");
      setPreview(null);
      return;
    }
    setPreview({ text: res.preview, notes: res.notes ?? 0, totalUnits: res.totalUnits ?? 0, totalCharge: res.totalCharge ?? 0 });
  }

  async function onExport() {
    setBusy("export");
    setError(null);
    setSuccess(null);
    const res = await bulkExport837P([...selected], options());
    setBusy(null);
    if (!res.ok || !res.file) {
      setError(res.error ?? "Export failed.");
      return;
    }
    const blob = new Blob([res.file], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = res.fileName ?? `dls-837p-${agencyTodayIso()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setSuccess(
      `Exported ${res.exported} claim${res.exported === 1 ? "" : "s"} · control number ${res.controlNumber}${testMode ? " · TEST interchange" : ""}. Notes marked billed${ledgerIsReal ? "; the batch is in the ledger below" : ""}.`
    );
    setSelected(new Set());
    setPreview(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select id="billing-month" aria-label="Month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">Every month</option>
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <select id="billing-client" aria-label="Client" className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="all">Every client</option>
          {clients.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select id="billing-service" aria-label="Service" className={selectClass} value={service} onChange={(e) => setService(e.target.value)}>
          <option value="all">Every service</option>
          {services.map((s) => (
            <option key={s} value={s}>{SERVICE_LABEL[s] ?? s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select id="billing-status" aria-label="Claim status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Ready and blocked</option>
          <option value="ready">Ready only</option>
          <option value="blocked">Blocked only</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {visible.length} of {rows.length} unbilled note{rows.length === 1 ? "" : "s"} · {readyVisible.length} ready
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(readyVisible.map((r) => r.id)))}>
          Select all ready ({readyVisible.length})
        </Button>
        {payers.length > 0 && (
          <select id="billing-payer" aria-label="Payer" className={selectClass} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            <option value="">Payer: Colorado Medicaid (default)</option>
            {payers.map((p) => (
              <option key={p.id} value={p.id}>Payer: {p.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input id="billing-test-mode" type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          Test interchange (ISA15 = T)
        </label>
        <Button variant="outline" onClick={() => void onPreview()} disabled={busy !== null || selected.size === 0}>
          {busy === "preview" ? "Building…" : "Preview file"}
        </Button>
        <Button onClick={() => void onExport()} disabled={busy !== null || selected.size === 0}>
          {busy === "export" ? "Exporting…" : `Export 837P (${selected.size})`}
        </Button>
        {selected.size > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{selectedUnits} units · ${selectedCharge.toFixed(2)} selected</span>
        )}
        {error && <span className="text-sm text-destructive" role="alert">{error}</span>}
        {success && <span className="rounded-btn bg-pill-success px-3 py-1.5 text-sm text-pill-success-fg">{success}</span>}
      </div>

      {preview && (
        <section className="rounded-card border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm">
            <span>
              <strong>Preview</strong> · {preview.notes} claim{preview.notes === 1 ? "" : "s"} · {preview.totalUnits} units · ${preview.totalCharge.toFixed(2)}
              {testMode ? " · TEST interchange" : ""} · control number 000000000 until exported
            </span>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Button>
          </div>
          <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-xs leading-5">{preview.text}</pre>
        </section>
      )}

      <Table>
        <THead>
          <tr>
            <th className="w-8"></th><th>Client</th><th>Medicaid ID</th><th>Date</th><th>Type</th>
            <th className="text-right">Units</th><th className="text-right">Charge</th><th>Claim status</th>
          </tr>
        </THead>
        <TBody>
          {visible.map((r) => (
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
              <td>{SERVICE_LABEL[r.visitType] ?? r.visitType.replace(/_/g, " ")}</td>
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
          {visible.length === 0 && (
            <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">{rows.length === 0 ? "No unbilled notes." : "No notes match these filters."}</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
