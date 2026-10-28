// components/admin/leads/leads-inbox.tsx — the inbox: inquiries by funnel
// stage, searchable, with who is working each one. Talks to the API directly
// (the same pattern as the Settings panels); the API scopes everything to the
// signed-in organization and enforces the feature switch and role grant.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { leadsApi, type LeadInboxResponse } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { LeadStageBadge } from "./lead-stage-badge";
import { NewLeadForm } from "./new-lead-form";
import { leadName, timeAgo } from "./format";

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-sm transition-colors",
        active ? "border-plum bg-plum text-white" : "border-border bg-card text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function Count({ n, active }: { n: number | undefined; active: boolean }) {
  return <span className={cn("tabular-nums text-xs", active ? "text-white/80" : "text-muted-foreground")}>{n ?? "…"}</span>;
}

export function LeadsInbox() {
  const router = useRouter();
  const [data, setData] = useState<LeadInboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("all");
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Search as you type, but not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    leadsApi
      .list({ stage, assignee: mine ? "me" : undefined, q: term || undefined, limit: 200 })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [stage, mine, term, reloadKey]);

  const stages = (data?.stages ?? []).filter((s) => s.active);
  const stageById = new Map((data?.stages ?? []).map((s) => [s.id, s]));
  const counts = data?.counts;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Pill active={stage === "all"} onClick={() => setStage("all")}>
          All <Count n={counts?.total} active={stage === "all"} />
        </Pill>
        {stages.map((s) => (
          <Pill key={s.id} active={stage === s.id} onClick={() => setStage(s.id)}>
            {s.label} <Count n={counts ? counts.byStage[s.id] ?? 0 : undefined} active={stage === s.id} />
          </Pill>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <Input
            type="search"
            autoComplete="off"
            aria-label="Search inquiries"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-border" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Assigned to me
        </label>
        {counts && counts.unassigned > 0 && (
          <span className="text-sm text-muted-foreground">
            {counts.unassigned} open {counts.unassigned === 1 ? "inquiry has" : "inquiries have"} nobody assigned yet.
          </span>
        )}
      </div>

      <Table>
        <THead>
          <tr>
            <th>Name</th>
            <th>Interested in</th>
            <th>Who</th>
            <th>Assigned to</th>
            <th>Stage</th>
            <th>Received</th>
          </tr>
        </THead>
        <TBody>
          {data?.leads.map((l) => (
            <tr key={l.id} className="hover:bg-muted/30">
              <td>
                <Link href={`/admin/leads/${l.id}`} className="font-medium text-plum hover:underline">
                  {leadName(l)}
                </Link>
                <div className="text-xs text-muted-foreground">{l.email ?? l.phone ?? ""}</div>
              </td>
              <td className="text-sm">{typeof l.answers.service === "string" && l.answers.service ? l.answers.service : "—"}</td>
              <td className="text-sm">{typeof l.answers.role === "string" && l.answers.role ? l.answers.role : l.source === "manual" ? "By hand" : "—"}</td>
              <td className="text-sm">{l.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>}</td>
              <td>
                <LeadStageBadge stage={stageById.get(l.stageId)} />
              </td>
              <td className="text-sm text-muted-foreground" title={new Date(l.submittedAt).toLocaleString()}>
                {timeAgo(l.submittedAt)}
                {l.source === "manual" && <Badge variant="muted" className="ml-2">By hand</Badge>}
              </td>
            </tr>
          ))}
          {data && data.leads.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                {term || mine || stage !== "all"
                  ? "No inquiries match."
                  : "No inquiries yet. New ones arrive here from the website's contact form, or add one by hand below."}
              </td>
            </tr>
          )}
          {!data && !error && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted-foreground">Loading inquiries…</td>
            </tr>
          )}
        </TBody>
      </Table>

      <NewLeadForm
        onCreated={(id) => {
          setReloadKey((k) => k + 1);
          router.push(`/admin/leads/${id}`);
        }}
      />
    </div>
  );
}
