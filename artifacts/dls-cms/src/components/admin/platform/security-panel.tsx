// components/admin/platform/security-panel.tsx — the provider's own security
// posture in one place: second factor, who holds a provider key, which
// organizations have opened a door, and what is being thrown at the sign-in
// page.
//
// It answers the question the overview only hints at — "how exposed am I?" —
// and puts the two remedies (enrol, cut a narrower key) next to the finding.
"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { ROLE_LABELS, type Role } from "@workspace/features";
import { platformApi, type AccountRow, type OrganizationRow, type SignInFailure, type SupportWindowRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MfaPanel } from "@/components/admin/mfa-panel";
import { OneTimePassword } from "@/components/admin/one-time-password";
import { fmtDateTime, relativeTime } from "@/components/admin/platform/format";

interface SecurityData {
  providerAccounts: AccountRow[];
  requireMfaForPlatform: boolean;
  breakGlassConfigured: boolean;
  supportWindows: SupportWindowRow[];
  supportWindowMaxHours: number;
  signInFailures: SignInFailure[];
}

export function SecurityPanel({
  selfId,
  mfa,
  canCutKeys,
}: {
  selfId: string;
  mfa: { enabled: boolean; required: boolean };
  canCutKeys: boolean;
}) {
  const [data, setData] = useState<SecurityData | null>(null);
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  async function load() {
    try {
      const [security, organizations] = await Promise.all([platformApi.security(), platformApi.organizations()]);
      setData(security);
      setOrgs(organizations.organizations);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (error && !data) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading security…</p>;

  const withoutMfa = data.providerAccounts.filter((a) => a.status === "Active" && !a.mfaEnabled).length;
  const openWindows = data.supportWindows.filter((w) => w.active);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {issued && <OneTimePassword email={issued.email} password={issued.password} onDismiss={() => setIssued(null)} />}

      <MfaPanel enabled={mfa.enabled} required={mfa.required} />

      {/* ── provider accounts ───────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-card border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4 text-plum-accent" /> Provider accounts
          </h2>
          <span className="text-xs text-muted-foreground">
            {data.providerAccounts.length} account{data.providerAccounts.length === 1 ? "" : "s"}
            {withoutMfa > 0 && ` · ${withoutMfa} without a second factor`}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Second factor</th><th>Status</th><th>Last sign-in</th></tr>
          </thead>
          <tbody className="[&_td]:px-4 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
            {data.providerAccounts.map((a) => (
              <tr key={a.id} className={a.status === "Suspended" ? "opacity-60" : undefined}>
                <td className="font-medium">
                  {a.fullName}
                  {a.id === selfId && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </td>
                <td className="text-plum-accent">{a.email}</td>
                <td>{ROLE_LABELS[a.role as Role]}</td>
                <td>{a.mfaEnabled ? <Badge variant="success">Enrolled</Badge> : <Badge variant="warning">None</Badge>}</td>
                <td><Badge variant={a.status === "Active" ? "success" : "muted"}>{a.status}</Badge></td>
                <td className="text-muted-foreground">{fmtDateTime(a.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Break-glass account:</span>{" "}
            {data.breakGlassConfigured
              ? "configured in the deployment. Keep its password where the primary account's holder cannot lose both."
              : "not configured. Set SUPER_ADMIN_BREAKGLASS_EMAIL and SUPER_ADMIN_BREAKGLASS_PASSWORD so a lost provider password is a sign-in rather than a lockout."}
          </p>
          <p>
            A Super Admin comes from the deployment and can never be created, changed or recovered from a screen.
            Support accounts are cut here and can be revoked here.
          </p>
        </div>
        {canCutKeys && <NewSupportAccount onCreated={(email, password) => { if (password) setIssued({ email, password }); void load(); }} />}
      </section>

      {/* ── support windows ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Support windows</h2>
          <p className="text-sm text-muted-foreground">
            An organization&rsquo;s Admin opens a window before anyone here can view as one of their people. Windows close by
            themselves; the longest one that can be granted is {data.supportWindowMaxHours} hours.
          </p>
        </div>
        {openWindows.length > 0 && (
          <ul className="divide-y divide-border rounded-card border border-pill-warning-fg/30 bg-pill-warning">
            {openWindows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm text-pill-warning-fg">
                <span>
                  <span className="font-medium">{w.orgName}</span> is open until {fmtDateTime(w.expiresAt)} — &ldquo;{w.reason}&rdquo;
                </span>
                <span className="text-xs">granted by {w.grantedByName}</span>
              </li>
            ))}
          </ul>
        )}
        <RequestWindow orgs={orgs} onRequested={() => void load()} />
        <div className="w-full overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
              <tr><th>Organization</th><th>Reason</th><th>Granted by</th><th>Expires</th><th>State</th></tr>
            </thead>
            <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border">
              {data.supportWindows.map((w) => (
                <tr key={w.id}>
                  <td className="font-medium">{w.orgName}</td>
                  <td className="text-muted-foreground">{w.reason}</td>
                  <td className="text-muted-foreground">{w.grantedByName}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(w.expiresAt)}</td>
                  <td>
                    {w.active ? (
                      <Badge variant="warning">Open</Badge>
                    ) : w.revokedAt ? (
                      <Badge variant="muted">Closed early</Badge>
                    ) : (
                      <Badge variant="muted">Expired</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {data.supportWindows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No organization has ever opened a window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── failed sign-ins ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-plum">
            <ShieldAlert className="h-4 w-4" /> Failed sign-ins, last 7 days
          </h2>
          <p className="text-sm text-muted-foreground">
            Only attempts against a real account are listed. An address that matches nothing is counted for the
            lock-out but never named here, because a list of misses is a list of guesses worth trying.
          </p>
        </div>
        <div className="w-full overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
              <tr><th>Account</th><th>Failures</th><th>Addresses</th><th>Most recent</th></tr>
            </thead>
            <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border">
              {data.signInFailures.map((f) => (
                <tr key={f.email}>
                  <td>
                    <div className="font-medium">{f.fullName ?? f.email}</div>
                    <div className="text-xs text-muted-foreground">{f.email}</div>
                  </td>
                  <td className={f.failures >= 5 ? "font-medium text-destructive" : undefined}>{f.failures}</td>
                  <td className="text-muted-foreground">{f.addresses}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{relativeTime(f.lastAttemptAt)}</td>
                </tr>
              ))}
              {data.signInFailures.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No failed sign-ins in the last week.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NewSupportAccount({ onCreated }: { onCreated: (email: string, temporaryPassword: string | null) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <details className="border-t border-border bg-muted/30">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Cut a support key</summary>
      <form
        className="space-y-3 px-4 pb-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            const r = await platformApi.createProviderUser({ email, fullName });
            onCreated(r.user.email, r.temporaryPassword);
            setFullName("");
            setEmail("");
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="support-name">Full name</Label>
            <Input id="support-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support-email">Email</Label>
            <Input id="support-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" size="sm" disabled={pending || !fullName || !email}>
          {pending ? "Creating…" : "Create support account"}
        </Button>
        <p className="text-xs text-muted-foreground">
          A support account reads the console, works an incident and ends sessions. It cannot change the switchboard,
          create accounts or cut other keys.
        </p>
      </form>
    </details>
  );
}

function RequestWindow({ orgs, onRequested }: { orgs: OrganizationRow[]; onRequested: () => void }) {
  const [orgId, setOrgId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        setNotice(null);
        try {
          const r = await platformApi.requestSupportWindow({ orgId, reason });
          setNotice(
            r.mailConfigured
              ? `Asked ${r.adminsNotified} administrator${r.adminsNotified === 1 ? "" : "s"}. They decide whether to open a window.`
              : `Recorded the request for ${r.adminsNotified} administrator${r.adminsNotified === 1 ? "" : "s"}, but no mail provider is configured — ask them directly.`
          );
          setReason("");
          onRequested();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="request-org">Ask an organization for access</Label>
        <select
          id="request-org"
          className="h-10 w-64 rounded-btn border border-border bg-card px-3 text-sm"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          <option value="">Choose…</option>
          {orgs
            .filter((o) => o.status === "active")
            .map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
        </select>
      </div>
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="request-reason">Why</Label>
        <Input
          id="request-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Investigating the failed billing export"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending || !orgId || reason.trim().length < 4}>
        {pending ? "Sending…" : "Request access"}
      </Button>
      {error && <p className="w-full text-sm text-destructive" role="alert">{error}</p>}
      {notice && <p className="w-full text-sm text-muted-foreground" role="status">{notice}</p>}
    </form>
  );
}
