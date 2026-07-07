// components/admin/monthly-report-generator.tsx — compose the month's state
// documents from daily entries (replaces the client's manual compilation).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MonthlyReportGenerator({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [month, setMonth] = useState(defaultMonth);
  const [kind, setKind] = useState<"sls" | "dvr">("sls");

  const base = `/api/reports/monthly?clientId=${clientId}&month=${month}&kind=${kind}`;

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
      <div className="flex flex-wrap gap-3">
        <a
          href={base}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center rounded-btn border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
        >
          Preview (print → PDF)
        </a>
        <Button
          onClick={() => {
            window.location.href = `${base}&format=doc&save=1`;
            setTimeout(() => router.refresh(), 1500);
          }}
          disabled={!clientId}
        >
          Download .doc &amp; file under Documents
        </Button>
      </div>
    </section>
  );
}
