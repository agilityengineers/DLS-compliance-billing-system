// components/admin/leads/lead-activity-timeline.tsx — what happened to an
// inquiry, newest first: the submission, every stage move and hand-over, the
// notes people left, and the conversion.
"use client";

import { LEAD_CLOSED_REASON_LABELS, type LeadActivity, type LeadAssignee, type LeadClosedReason, type LeadStage } from "@/lib/api/admin";
import { formatWhen, timeAgo } from "./format";

export function LeadActivityTimeline({
  activities,
  stages,
  people,
}: {
  activities: LeadActivity[];
  stages: LeadStage[];
  people: LeadAssignee[];
}) {
  const stageLabel = (id: unknown, key: unknown): string => {
    const byId = typeof id === "string" ? stages.find((s) => s.id === id) : undefined;
    if (byId) return byId.label;
    return typeof key === "string" ? key : "another stage";
  };
  const personName = (id: unknown): string => {
    if (typeof id !== "string") return "someone";
    return people.find((p) => p.id === id)?.fullName ?? "a team member";
  };
  const actor = (a: LeadActivity): string => a.actorName ?? "Someone";

  function describe(a: LeadActivity): string {
    const d = a.details ?? {};
    switch (a.type) {
      case "submitted":
        if (d.source === "manual") return `${actor(a)} added this inquiry by hand.`;
        if (d.duplicate) return "Sent the website form again (folded into this inquiry).";
        if (d.resubmittedAs) return "Sent the website form again with different answers; they are a separate inquiry in the inbox.";
        if (d.importedFrom) return "Sent the website's contact form (stored before the inbox existed and brought in later).";
        if (d.earlierLeadId) return "Sent the website's contact form; an earlier inquiry from this email is also in the inbox.";
        return "Sent the website's contact form.";
      case "stage_changed": {
        const to = stageLabel(d.to, d.toKey);
        const from = stageLabel(d.from, d.fromKey);
        const reason = typeof d.closedReason === "string" ? LEAD_CLOSED_REASON_LABELS[d.closedReason as LeadClosedReason] : null;
        return `${actor(a)} moved it from ${from} to ${to}${reason ? ` — ${reason.toLowerCase()}` : ""}.`;
      }
      case "assigned":
        return d.to ? `${actor(a)} assigned it to ${personName(d.to)}.` : `${actor(a)} took it off ${personName(d.from)}'s list.`;
      case "note":
        return `${actor(a)} noted:`;
      case "converted":
        return `${actor(a)} converted it into a client.`;
      default:
        return a.type;
    }
  }

  if (activities.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;

  return (
    <ol className="space-y-3">
      {activities.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          <span
            aria-hidden
            className={
              a.type === "converted"
                ? "mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-pill-success-fg"
                : a.type === "note"
                  ? "mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-plum-accent"
                  : "mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-border"
            }
          />
          <div className="min-w-0 flex-1">
            <div>{describe(a)}</div>
            {a.note && <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-foreground">{a.note}</p>}
            <div className="mt-0.5 text-xs text-muted-foreground" title={formatWhen(a.createdAt)}>
              {timeAgo(a.createdAt)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
