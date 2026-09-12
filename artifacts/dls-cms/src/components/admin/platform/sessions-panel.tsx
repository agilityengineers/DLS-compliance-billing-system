// components/admin/platform/sessions-panel.tsx — who is signed in right now,
// on what, from where. The two controls are the lost-device and off-boarding
// answers: end one session, or sign a person out of everything.
"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ROLE_LABELS } from "@workspace/features";
import { platformApi, type PlatformSessionRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeUserAgent, fmtDateTime, relativeTime } from "@/components/admin/platform/format";

export function ActiveSessionsPanel() {
  const [sessions, setSessions] = useState<PlatformSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setSessions((await platformApi.sessions()).sessions);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !sessions) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!sessions) return <p className="text-sm text-muted-foreground">Loading sessions…</p>;

  const people = new Set(sessions.map((s) => s.userId)).size;
  const support = sessions.filter((s) => s.impersonatingUserId).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {sessions.length} active session{sessions.length === 1 ? "" : "s"} for {people} {people === 1 ? "person" : "people"}
          {support > 0 && <> · {support} support session{support === 1 ? "" : "s"} in progress</>}
        </span>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}

      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr><th>Person</th><th>Organization</th><th>Signed in</th><th>Last active</th><th>From</th><th>Viewing as</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="font-medium">
                    {s.userName}
                    {s.current && <Badge variant="default" className="ml-2">you</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.userEmail} · {ROLE_LABELS[s.role]}</div>
                </td>
                <td className="text-muted-foreground">{s.orgName ?? "Platform"}</td>
                <td className="whitespace-nowrap text-muted-foreground" title={fmtDateTime(s.createdAt)}>{relativeTime(s.createdAt)}</td>
                <td className="whitespace-nowrap text-muted-foreground" title={`Expires ${fmtDateTime(s.expiresAt)} unless used`}>{relativeTime(s.lastSeenAt)}</td>
                <td className="text-muted-foreground">
                  <div>{describeUserAgent(s.userAgent)}</div>
                  <div className="text-xs">{s.ip ?? "address unknown"}</div>
                </td>
                <td>{s.impersonatingName ? <Badge variant="warning">as {s.impersonatingName}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={s.current || busy === `end:${s.id}`}
                      title={s.current ? "Use Sign out for your own session." : "End this one session; other devices stay signed in."}
                      onClick={() =>
                        void run(`end:${s.id}`, async () => {
                          await platformApi.revokeSession(s.id);
                          return `Ended ${s.userName}'s session.`;
                        })
                      }
                    >
                      End session
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={s.current || s.role === "Super_Admin" || busy === `all:${s.userId}`}
                      title="End every session this person has, on every device."
                      onClick={() =>
                        void run(`all:${s.userId}`, async () => {
                          const r = await platformApi.revokeUserSessions(s.userId);
                          return `Signed ${s.userName} out of ${r.revoked} session${r.revoked === 1 ? "" : "s"}.`;
                        })
                      }
                    >
                      Sign out everywhere
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nobody is signed in.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        A session ends on its own after the idle window or the maximum lifetime set in System status. Ending it here
        takes effect on that device&rsquo;s next request. Suspending an account or resetting its password also ends all of its sessions.
      </p>
    </div>
  );
}
