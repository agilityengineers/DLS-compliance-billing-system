// components/admin/claim-ledger.tsx — every 837P batch that went out, with
// what the payer said back. The answer is recorded here by hand (accepted,
// rejected, paid, denied) until remittances are read in; a sent batch is
// voided, never deleted. Rows from the practice ledger show without controls.
"use client";

import { useState } from "react";
import { billingApi, type SubmissionStatus } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClaimExport } from "@/lib/supabase/types";
import { formatAgencyDateTime } from "@workspace/time";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  paid: "Paid",
  denied: "Denied",
  voided: "Voided",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "default"> = {
  open: "muted",
  submitted: "default",
  accepted: "warning",
  rejected: "destructive",
  paid: "success",
  denied: "destructive",
  voided: "muted",
};
/** The answers that make sense from each state — the same table the API enforces. */
const NEXT: Record<string, Exclude<SubmissionStatus, "open">[]> = {
  submitted: ["accepted", "rejected", "paid", "denied", "voided"],
  accepted: ["paid", "denied", "voided"],
  rejected: ["submitted", "voided"],
  paid: ["voided"],
  denied: ["submitted", "voided"],
};

export function ClaimLedger({ exports: initial, canRecord }: { exports: ClaimExport[]; canRecord: boolean }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ status: Exclude<SubmissionStatus, "open">; note: string }>({ status: "accepted", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await billingApi.submissions.setStatus(id, choice.status, choice.note || undefined);
      setRows((list) => list.map((r) => (r.id === id ? { ...r, status: res.submission.status, status_note: res.submission.statusNote } : r)));
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-8 space-y-2">
      <h2 className="font-serif text-lg font-semibold text-plum">Claim batches</h2>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <ul className="divide-y divide-border rounded-card border border-border bg-card text-sm">
        {rows.map((e) => {
          const status = e.status ?? "submitted";
          const next = NEXT[status] ?? [];
          return (
            <li key={e.id} className="space-y-2 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="tabular-nums text-muted-foreground">{formatAgencyDateTime(e.exported_at)}</span>
                <span className="font-medium">CN {e.control_number}</span>
                <span>{e.note_ids.length} note{e.note_ids.length === 1 ? "" : "s"}</span>
                <span className="tabular-nums">{e.total_units} units</span>
                <span className="tabular-nums font-medium">${e.total_charge.toFixed(2)}</span>
                <span className="text-muted-foreground">{e.payer.replace(/_/g, " ")}</span>
                {e.test_mode && <Badge variant="warning">Test</Badge>}
                <Badge variant={STATUS_VARIANT[status] ?? "muted"}>{STATUS_LABEL[status] ?? status}</Badge>
                {e.status_note && <span className="text-muted-foreground">{e.status_note}</span>}
                <span className="ml-auto flex items-center gap-2">
                  {e.is_record && status !== "open" && (
                    <a className="text-plum hover:underline" href={billingApi.submissions.fileUrl(e.id)} download={e.file_name ?? undefined}>Download file</a>
                  )}
                  {canRecord && e.is_record && next.length > 0 && editing !== e.id && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(e.id); setChoice({ status: next[0]!, note: "" }); }}>
                      Record answer
                    </Button>
                  )}
                </span>
              </div>
              {editing === e.id && (
                <form
                  className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void record(e.id);
                  }}
                >
                  <select
                    id={`ledger-status-${e.id}`}
                    aria-label="What the payer said"
                    className="h-9 rounded-btn border border-border bg-card px-2 text-sm"
                    value={choice.status}
                    onChange={(ev) => setChoice((c) => ({ ...c, status: ev.target.value as Exclude<SubmissionStatus, "open"> }))}
                  >
                    {next.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <Input
                    id={`ledger-note-${e.id}`}
                    aria-label="Note"
                    className="h-9 min-w-56 flex-1"
                    placeholder="999 / 277 reference, check number, denial reason…"
                    value={choice.note}
                    onChange={(ev) => setChoice((c) => ({ ...c, note: ev.target.value }))}
                  />
                  <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
