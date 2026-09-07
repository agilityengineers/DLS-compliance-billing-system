// components/admin/monthly-report-generator.tsx — compose the month's state
// documents from daily entries (replaces the client's manual compilation).
// Client-only build: the report is composed in-browser and opened/downloaded
// directly (the old /api/reports/monthly route ran the same composer).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { composeDvrMonthlyReport, composeSlsBillingNote } from "@/lib/reports/monthly";
import { createDocument } from "@/lib/data/repo-field";
import { getSessionContext } from "@/lib/auth/session";
import { useRevalidate } from "@/shims/use-revalidate";
import { revalidatePath } from "next/cache";

async function compose(clientId: string, month: string, kind: "sls" | "dvr") {
  return kind === "dvr"
    ? composeDvrMonthlyReport(clientId, month)
    : composeSlsBillingNote(clientId, month);
}

export function MonthlyReportGenerator({ clients }: { clients: { id: string; name: string }[] }) {
  useRevalidate();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [month, setMonth] = useState(defaultMonth);
  const [kind, setKind] = useState<"sls" | "dvr">("sls");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPreview() {
    setError(null);
    const report = await compose(clientId, month, kind);
    if (!report) { setError("Client not found"); return; }
    const win = window.open("", "_blank");
    if (win) {
      win.document.open();
      win.document.write(report.html);
      win.document.close();
    }
  }

  async function onDownload() {
    setError(null);
    setBusy(true);
    try {
      const report = await compose(clientId, month, kind);
      if (!report) { setError("Client not found"); return; }
      const fileName = `${report.title.replace(/[^\w]+/g, "-").toLowerCase()}.doc`;

      const blob = new Blob([report.html], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const ctx = await getSessionContext();
      if (ctx.effectiveUser) {
        await createDocument(
          {
            kind: kind === "dvr" ? "dvr_monthly_report" : "monthly_billing_note",
            client_id: clientId,
            visit_id: null,
            uploaded_by: ctx.effectiveUser.id,
            file_name: fileName,
            content_type: "application/msword",
            size_bytes: report.html.length,
            storage_provider: "demo",
            storage_key: null,
            status: "synced",
            metadata: { month, kind, generated: true },
          },
          ctx.auditCtx,
        );
      }
      revalidatePath("/admin/reports");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-card border border-border bg-card p-4">
      <h2 className="font-serif text-lg font-semibold text-plum">Generate monthly report</h2>
      <p className="text-sm text-muted-foreground">
        Composed automatically from daily progress notes, EVV times, trips, and cancellations.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Client</span>
          <select
            className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Month</span>
          <input
            type="month"
            className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Report</span>
          <select
            className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as "sls" | "dvr")}
          >
            <option value="sls">State SLS Billing note (SCC + NMT)</option>
            <option value="dvr">DVR Monthly Progress Report</option>
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-pill-danger-fg">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onPreview()}
          disabled={!clientId}
          className="inline-flex h-10 items-center rounded-btn border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Preview (print → PDF)
        </button>
        <Button onClick={() => void onDownload()} disabled={!clientId || busy}>
          Download .doc &amp; file under Documents
        </Button>
      </div>
    </section>
  );
}
