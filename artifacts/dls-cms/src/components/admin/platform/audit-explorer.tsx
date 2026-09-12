// components/admin/platform/audit-explorer.tsx — the platform-wide audit log
// with the filters a provider actually reaches for (what kind of event, which
// organization, since when) and a CSV export for anyone who asks for the
// record. Rows are the same shape everywhere; see config-audit.tsx.
"use client";

import { useEffect, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { platformApi, type AuditCategory, type AuditEntry, type AuditVerification, type OrganizationRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { AuditTable, auditLabel, summarizeAudit } from "@/components/admin/config-audit";

const CATEGORIES: { value: "" | AuditCategory; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "auth", label: "Sign-ins, sign-outs & support sessions" },
  { value: "platform", label: "Provider switches & bootstrap" },
  { value: "org", label: "Organization & feature-access changes" },
  { value: "user", label: "Account changes & password resets" },
  { value: "session", label: "Sessions ended by the provider" },
  { value: "support", label: "Support windows granted, revoked and requested" },
];

const SELECT = "h-9 rounded-btn border border-border bg-card px-2 text-sm";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(entries: AuditEntry[]): string {
  const header = ["when", "actor", "acting_as", "action", "label", "organization", "target_type", "target_id", "summary", "details"];
  const lines = entries.map((e) =>
    [
      e.createdAt,
      e.actorName ?? "system",
      e.impersonatingName ?? "",
      e.action,
      auditLabel(e.action),
      e.orgName ?? (e.orgId ? e.orgId : "platform"),
      e.targetType,
      e.targetId ?? "",
      summarizeAudit(e),
      e.details ? JSON.stringify(e.details) : "",
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export function AuditExplorer() {
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [category, setCategory] = useState<"" | AuditCategory>("");
  const [orgId, setOrgId] = useState("");
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState(200);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retentionYears, setRetentionYears] = useState<number | null>(null);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    void platformApi.organizations().then((r) => setOrgs(r.organizations)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void platformApi
      .audit({ limit, category: category || undefined, orgId: orgId || undefined, since: since || undefined })
      .then((r) => {
        if (cancelled) return;
        setEntries(r.entries);
        setRetentionYears(r.retentionYears ?? null);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, orgId, since, limit]);

  function exportCsv() {
    if (!entries || entries.length === 0) return;
    const blob = new Blob([toCsv(entries)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dls-platform-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const serverExportUrl = platformApi.auditExportUrl({
    category: category || undefined,
    orgId: orgId || undefined,
    since: since || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={SELECT} value={category} onChange={(e) => setCategory(e.target.value as "" | AuditCategory)} aria-label="Kind of event">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select className={SELECT} value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-label="Organization">
          <option value="">All organizations</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Since</span>
          <input type="date" className={SELECT} value={since} onChange={(e) => setSince(e.target.value)} aria-label="Since date" />
        </label>
        <select className={SELECT} value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Rows">
          <option value={100}>Latest 100</option>
          <option value={200}>Latest 200</option>
          <option value={500}>Latest 500</option>
        </select>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{loading ? "Loading…" : entries ? `${entries.length} shown` : ""}</span>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!entries || entries.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export shown
          </Button>
          <a
            href={serverExportUrl}
            className="inline-flex items-center gap-1 rounded-btn border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            title="Everything matching these filters, straight from the server, with each entry's hash."
          >
            <Download className="h-3.5 w-3.5" /> Export all matching
          </a>
        </span>
      </div>

      {/* ── tamper check ─────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4">
        <div className="min-w-64 flex-1">
          <h2 className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4 text-plum-accent" /> Tamper check
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each entry carries the fingerprint of the one before it, so a changed, deleted or reordered row breaks the
            chain from that point on. The database refuses edits outright; this proves nothing slipped past it.
            {retentionYears !== null && ` Entries are kept for ${retentionYears} years.`}
          </p>
          {verification && (
            <p className={`mt-2 text-sm ${verification.ok ? "text-pill-success-fg" : "text-destructive"}`} role="status">
              {verification.ok
                ? `Verified ${verification.checked} entries — the chain is intact.`
                : `The chain breaks at entry ${verification.firstBadSeq}. That entry has been changed or removed since it was written.`}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={verifying}
          onClick={async () => {
            setVerifying(true);
            setError(null);
            try {
              setVerification(await platformApi.verifyAudit());
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setVerifying(false);
            }
          }}
        >
          {verifying ? "Checking…" : "Verify the chain"}
        </Button>
      </section>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {entries ? <AuditTable entries={entries} showOrg /> : !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      <p className="text-xs text-muted-foreground">
        The log records every sign-in, failed sign-in against a real account, switch flip, account change, password
        reset, support window and view-as session, with the real identity that acted. It is append-only: the database
        itself refuses an update or a delete, and the hash chain makes any edit that got past it visible.
      </p>
    </div>
  );
}
