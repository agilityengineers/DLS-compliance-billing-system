// components/admin/leads/lead-detail-panel.tsx — one inquiry: what the person
// told us, where it is in the funnel, who has it, the notes, and the one
// button that turns it into a client.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LEAD_CLOSED_REASON_LABELS,
  leadsApi,
  type LeadClosedReason,
  type LeadDetailResponse,
  type LeadStage,
} from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LeadActivityTimeline } from "./lead-activity-timeline";
import { LeadStageBadge } from "./lead-stage-badge";
import { formatAnswer, formatWhen, leadName, timeAgo } from "./format";

const IDENTITY_KEYS = new Set(["firstName", "lastName", "email", "phone"]);
const CLOSED_REASONS = Object.keys(LEAD_CLOSED_REASON_LABELS) as LeadClosedReason[];
const selectClass = "h-10 w-full rounded-btn border border-border bg-card px-2 text-sm disabled:opacity-60";

export function LeadDetailPanel({ id, canConvert }: { id: string; canConvert: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<LeadDetailResponse | null>(null);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ stageId: string; reason: LeadClosedReason } | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([leadsApi.get(id), leadsApi.list({ limit: 0 })])
      .then(([detail, box]) => {
        if (cancelled) return;
        setData(detail);
        setStages(box.stages);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function run(key: string, fn: () => Promise<LeadDetailResponse>) {
    setBusy(key);
    setError(null);
    try {
      setData(await fn());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <Link href="/admin/leads" className="text-sm text-plum hover:underline">← Leads</Link>
        <p className="text-sm text-destructive" role="alert">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading inquiry…</p>;

  const { lead, activities, assignees } = data;
  const converted = lead.stage?.kind === "won" || Boolean(lead.convertedClientId);
  const closed = lead.stage?.kind === "lost";
  // Conversion happens through the client intake, never by picking the stage.
  const choosable = stages.filter((s) => (s.active && s.kind !== "won") || s.id === lead.stageId);
  const contact = [lead.email, lead.phone].filter(Boolean);
  const answered = lead.questionSnapshot.filter((q) => !IDENTITY_KEYS.has(q.key));

  function chooseStage(stageId: string) {
    const target = stages.find((s) => s.id === stageId);
    if (!target || target.id === lead.stageId) return;
    if (target.kind === "lost") {
      setClosing({ stageId, reason: lead.closedReason ?? "no_response" });
      return;
    }
    setClosing(null);
    void run("stage", () => leadsApi.update(id, { stageId }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/leads" className="text-sm text-plum hover:underline">← Leads</Link>
          <h1 className="page-title mt-1">{leadName(lead)}</h1>
          <p className="text-sm text-muted-foreground">
            {lead.source === "website" ? "Website inquiry" : "Added by hand"} · received {timeAgo(lead.submittedAt)}
            {lead.assignedToName ? ` · with ${lead.assignedToName}` : " · nobody assigned yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LeadStageBadge stage={lead.stage} />
          {closed && lead.closedReason && <Badge variant="muted">{LEAD_CLOSED_REASON_LABELS[lead.closedReason]}</Badge>}
        </div>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="rounded-card border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 font-medium">What they told us</h2>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {lead.email && <a className="text-plum-accent hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
                {lead.phone && <a className="text-plum-accent hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>}
                {contact.length === 0 && <span className="text-muted-foreground">No contact details given.</span>}
              </div>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                {answered.map((q) => (
                  <div key={q.key} className="contents">
                    <dt className="text-sm text-muted-foreground">{q.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm">{formatAnswer(lead.answers[q.key], q.type)}</dd>
                  </div>
                ))}
                {answered.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">Only a name and contact details.</p>}
              </dl>
            </div>
          </section>

          <section className="rounded-card border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 font-medium">Notes &amp; activity</h2>
            <div className="space-y-4 p-4">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = note.trim();
                  if (!text) return;
                  void run("note", async () => {
                    const res = await leadsApi.addNote(id, text);
                    setNote("");
                    return res;
                  });
                }}
              >
                <Label htmlFor="lead-note">Add a note</Label>
                <Textarea
                  id="lead-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Left a voicemail; will try again Thursday."
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={busy === "note" || !note.trim()}>{busy === "note" ? "Saving…" : "Add note"}</Button>
                </div>
              </form>
              <LeadActivityTimeline activities={activities} stages={stages} people={assignees} />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-card border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 font-medium">Next step</h2>
            <div className="space-y-4 p-4">
              {converted ? (
                <div className="rounded-md bg-pill-success p-3 text-sm text-pill-success-fg">
                  This inquiry became a client
                  {lead.convertedClient ? `: ${lead.convertedClient.firstName} ${lead.convertedClient.lastName}` : ""}.{" "}
                  <Link href="/admin/clients" className="underline">Open the roster</Link>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-stage">Stage</Label>
                    <select
                      id="lead-stage"
                      className={selectClass}
                      value={closing?.stageId ?? lead.stageId}
                      disabled={busy === "stage"}
                      onChange={(e) => chooseStage(e.target.value)}
                    >
                      {choosable.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}{s.active ? "" : " (retired)"}</option>
                      ))}
                    </select>
                  </div>

                  {closing && (
                    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                      <Label htmlFor="lead-close-reason">Why is this inquiry closing?</Label>
                      <select
                        id="lead-close-reason"
                        className={selectClass}
                        value={closing.reason}
                        onChange={(e) => setClosing({ ...closing, reason: e.target.value as LeadClosedReason })}
                      >
                        {CLOSED_REASONS.map((r) => (
                          <option key={r} value={r}>{LEAD_CLOSED_REASON_LABELS[r]}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy === "stage"}
                          onClick={() => {
                            const { stageId, reason } = closing;
                            void run("stage", async () => {
                              const res = await leadsApi.update(id, { stageId, closedReason: reason });
                              setClosing(null);
                              return res;
                            });
                          }}
                        >
                          Close inquiry
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setClosing(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {closed && !closing && (
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-closed-reason">Reason</Label>
                      <select
                        id="lead-closed-reason"
                        className={selectClass}
                        value={lead.closedReason ?? "other"}
                        disabled={busy === "reason"}
                        onChange={(e) => void run("reason", () => leadsApi.update(id, { closedReason: e.target.value as LeadClosedReason }))}
                      >
                        {CLOSED_REASONS.map((r) => (
                          <option key={r} value={r}>{LEAD_CLOSED_REASON_LABELS[r]}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="lead-assignee">Assigned to</Label>
                    <select
                      id="lead-assignee"
                      className={selectClass}
                      value={lead.assignedToUserId ?? ""}
                      disabled={busy === "assign"}
                      onChange={(e) => void run("assign", () => leadsApi.update(id, { assignedToUserId: e.target.value || null }))}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>{a.fullName} · {a.role.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>

                  {canConvert && (
                    <div className="space-y-1.5 border-t border-border pt-4">
                      <Button variant="plum" className="w-full" onClick={() => router.push(`/admin/clients/new?leadId=${id}`)}>
                        Convert to client
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Opens the client intake with these details filled in. Saving it creates the client and marks this inquiry as converted.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="rounded-card border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 font-medium">Details</h2>
            <dl className="space-y-2 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Source</dt><dd className="text-right">{lead.source === "website" ? `Website${lead.sourcePage ? ` (${lead.sourcePage})` : ""}` : "Added by hand"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Received</dt><dd className="text-right">{formatWhen(lead.submittedAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Last activity</dt><dd className="text-right">{formatWhen(lead.lastActivityAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Consent to contact</dt><dd className="text-right">{lead.consentAt ? formatWhen(lead.consentAt) : "Not recorded"}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
