// components/admin/platform/support-access.tsx — the one door into an
// organization for the provider: an audited "view as" session. This screen
// states the policy, starts a session, shows the ones running and keeps the
// history in plain sight, because the whole arrangement rests on that access
// being visible and attributable. The Admin-granted window of review decision
// D-02 is optional (REQUIRE_SUPPORT_WINDOW, off by default since the owner's
// decision of 2026-09-16); Security and System status show whether this
// deployment requires it.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@workspace/features";
import { platformApi, type AuditEntry, type OrganizationRow, type PlatformSessionRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { startImpersonation } from "@/lib/auth/impersonation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuditTable } from "@/components/admin/config-audit";
import { fmtDateTime, relativeTime } from "@/components/admin/platform/format";

const SELECT = "h-10 w-full rounded-btn border border-border bg-card px-3 text-sm";

export function SupportAccessPanel({ selfId }: { selfId: string }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrganizationRow[] | null>(null);
  const [running, setRunning] = useState<PlatformSessionRow[]>([]);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [o, s, h] = await Promise.all([
      platformApi.organizations(),
      platformApi.sessions(),
      platformApi.audit({ action: "auth.impersonation_started,auth.impersonation_stopped", limit: 100 }),
    ]);
    setOrgs(o.organizations);
    setRunning(s.sessions.filter((x) => x.impersonatingUserId !== null));
    setHistory(h.entries);
  }
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, []);

  const candidates = orgs?.find((o) => o.id === orgId)?.users.filter((u) => u.status === "Active" && u.id !== selfId) ?? [];

  async function start() {
    setBusy("start");
    setError(null);
    try {
      const res = await startImpersonation(userId);
      if (!res.ok) throw new Error(res.error ?? "Could not start the support session.");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function end(session: PlatformSessionRow) {
    setBusy(`end:${session.id}`);
    setError(null);
    try {
      await platformApi.revokeSession(session.id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !orgs) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!orgs) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <section className="space-y-2 rounded-card border border-border bg-card p-4 text-sm">
        <h2 className="font-medium">How support access works</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            The provider account has no screens of its own into client records. The only way in is a &ldquo;view as&rdquo;
            session, which opens the app exactly as the chosen person sees it, with their role and their feature access.
          </li>
          <li>Every action during the session is written to the audit log under your real identity, with the person you were viewing as.</li>
          <li>The session ends when you click Exit in the banner, when you sign out, or when the idle timeout signs you out.</li>
          <li>
            A deployment can additionally require the organization&rsquo;s Admin to open a time-boxed support window first
            (REQUIRE_SUPPORT_WINDOW). Whether this one does is shown on Security and System status; when it does, a session
            outside a window is refused and the message says how to ask for one.
          </li>
        </ul>
      </section>

      <section className="space-y-3 rounded-card border border-border bg-card p-4">
        <h2 className="font-medium">Start a support session</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="support-org">Organization</Label>
            <select
              id="support-org"
              className={SELECT}
              value={orgId}
              onChange={(e) => {
                setOrgId(e.target.value);
                setUserId("");
              }}
            >
              <option value="">Choose…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id} disabled={o.status !== "active"}>
                  {o.name}{o.status !== "active" ? " (suspended)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support-user">View as</Label>
            <select id="support-user" className={SELECT} value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!orgId}>
              <option value="">Choose…</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName} · {ROLE_LABELS[u.role]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="plum" disabled={!userId || busy === "start"} onClick={() => void start()}>
              {busy === "start" ? "Starting…" : "View as this person"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose the Admin to see the organization the way its owner does, or an employee to reproduce exactly what they report.
          {orgId && candidates.length === 0 && " This organization has no active accounts to view as."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-plum">In progress</h2>
        {running.length === 0 ? (
          <p className="text-sm text-muted-foreground">No support session is running.</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {running.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{s.userName}</span> is viewing as <Badge variant="warning">{s.impersonatingName}</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">started {relativeTime(s.createdAt)} · last active {relativeTime(s.lastSeenAt)}</span>
                </span>
                <Button size="sm" variant="outline" disabled={s.current || busy === `end:${s.id}`} onClick={() => void end(s)}>
                  End session
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-plum">History</h2>
          {history && history.length > 0 && (
            <span className="text-xs text-muted-foreground">Latest {fmtDateTime(history[0]!.createdAt)}</span>
          )}
        </div>
        {history ? <AuditTable entries={history} showOrg /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </section>
    </div>
  );
}
