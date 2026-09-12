// components/admin/platform/system-status.tsx — the service as the provider
// sees it without a shell: process, database and migrations, the sign-in and
// support policy in force, mail, the scheduled jobs, and the warnings that
// come out of that configuration. Secrets are never shown — only whether they
// are set.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert, Info, RefreshCw } from "lucide-react";
import { platformApi, type JobStatusRow, type MailOutboxRow, type SystemStatus } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtDuration, relativeTime } from "@/components/admin/platform/format";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 font-medium">{title}</h2>
      <dl className="divide-y divide-border text-sm">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function SystemStatusPanel() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [jobs, setJobs] = useState<{ jobs: JobStatusRow[]; schedulerEnabled: boolean; intervalMinutes: number; externalCronConfigured: boolean } | null>(null);
  const [mail, setMail] = useState<MailOutboxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [status, jobList, outbox] = await Promise.all([
        platformApi.system(),
        platformApi.jobs(),
        platformApi.mail(25).catch(() => null),
      ]);
      setData(status);
      setJobs(jobList);
      setMail(outbox?.messages ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (error && !data) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading system status…</p>;

  const m = data.database.migrations;
  const chain = data.security.auditChain;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          Read from the API server&rsquo;s environment at start-up. Secrets are never shown, only whether they are set.
        </span>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}

      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">Configuration checks</h2>
        {data.warnings.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Nothing to flag.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                {w.severity === "warning" ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-pill-warning-fg" aria-label="warning" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-plum-accent" aria-label="note" />
                )}
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Service">
          <Row label="Environment">{data.service.environment}</Row>
          <Row label="Host">{data.service.host.replace("-", " ")}</Row>
          <Row label="Node.js">{data.service.nodeVersion}</Row>
          <Row label="Started">{fmtDateTime(data.service.startedAt)}</Row>
          <Row label="Uptime">{fmtDuration(data.service.uptimeSeconds)}</Row>
          <Row label="Build">
            {data.service.gitSha ? (
              <code className="rounded bg-muted px-1 text-xs">{data.service.gitSha.slice(0, 12)}</code>
            ) : (
              <span className="text-muted-foreground">not stamped (set GIT_SHA)</span>
            )}
          </Row>
        </Card>

        <Card title="Database">
          <Row label="Connection">
            {data.database.ok ? (
              <Badge variant="success">ok · {data.database.latencyMs} ms</Badge>
            ) : (
              <Badge variant="destructive">failed</Badge>
            )}
          </Row>
          <Row label="PostgreSQL">{data.database.serverVersion ?? "—"}</Row>
          <Row label="Migrations">{m ? `${m.applied} of ${m.total} applied` : "—"}</Row>
          <Row label="Latest">
            {m?.latestApplied ? <code className="rounded bg-muted px-1 text-xs">{m.latestApplied.tag}</code> : "—"}
          </Row>
          {m && m.pending.length > 0 && (
            <Row label="Pending"><span className="text-destructive">{m.pending.join(", ")}</span></Row>
          )}
          {data.database.error && <Row label="Error"><span className="text-destructive">{data.database.error}</span></Row>}
        </Card>

        <Card title="Security">
          <Row label="Two-factor on provider accounts">
            {data.security.requireMfaForPlatform ? <Badge variant="success">Required</Badge> : <Badge variant="warning">Optional</Badge>}
          </Row>
          <Row label="Provider accounts enrolled">
            {data.security.providerAccountsWithMfa} of {data.security.providerAccounts}
          </Row>
          <Row label="Break-glass account">
            {data.security.breakGlassConfigured ? <Badge variant="success">Configured</Badge> : <Badge variant="warning">Not configured</Badge>}
          </Row>
          <Row label="Longest support window">{data.security.supportWindowMaxHours} hours</Row>
          <Row label="Audit retention">{data.security.auditRetentionYears} years</Row>
          <Row label="Audit chain">
            {chain.lastVerifiedAt === null ? (
              <span className="text-muted-foreground">never verified</span>
            ) : chain.ok ? (
              <Badge variant="success">intact · {chain.entriesChecked} entries · {relativeTime(chain.lastVerifiedAt)}</Badge>
            ) : (
              <Badge variant="destructive">broken · {relativeTime(chain.lastVerifiedAt)}</Badge>
            )}
          </Row>
        </Card>

        <Card title="Sign-in policy">
          <Row label="Session cookie">
            <code className="rounded bg-muted px-1 text-xs">{data.signIn.cookieName}</code> ·{" "}
            {data.signIn.cookieSecure ? "Secure" : "not Secure"}
          </Row>
          <Row label="Idle sign-out">
            {data.signIn.sessionIdleMinutes >= 60
              ? `${Math.round(data.signIn.sessionIdleMinutes / 60)} h`
              : `${data.signIn.sessionIdleMinutes} min`}
          </Row>
          <Row label="Maximum session">{data.signIn.sessionMaxDays} day{data.signIn.sessionMaxDays === 1 ? "" : "s"}</Row>
          <Row label="Lock-out">
            {data.signIn.loginMaxFailures} failures in {data.signIn.loginWindowMinutes} min
            <span className="ml-1 text-xs font-normal text-muted-foreground">({data.signIn.limiterBackedBy})</span>
          </Row>
          <Row label="Attempts kept">{data.signIn.attemptRetentionDays} days</Row>
          <Row label="Behind a proxy">{data.signIn.trustProxy ? "yes (client addresses from X-Forwarded-For)" : "no"}</Row>
          <Row label="Cross-site origins">
            {data.signIn.corsOrigins.length === 0 ? "none (same-origin only)" : data.signIn.corsOrigins.join(", ")}
          </Row>
        </Card>

        <Card title="Mail">
          <Row label="Provider">
            {data.mail.configured ? <Badge variant="success">SendGrid</Badge> : <Badge variant="warning">Not configured</Badge>}
          </Row>
          <Row label="Sends from">@{data.mail.fromDomain}</Row>
          {data.mail.sandbox && <Row label="Sandbox"><Badge variant="muted">validate only, no delivery</Badge></Row>}
          {data.mail.redirectAllTo && <Row label="Redirected to">{data.mail.redirectAllTo}</Row>}
          <Row label="PHI in email">
            {data.mail.baaSignedAllVendors ? "allowed (BAA recorded)" : "blocked until a BAA is recorded"}
          </Row>
        </Card>

        <Card title="Provider account">
          <Row label="Email">{data.provider.superAdminEmail}</Row>
          <Row label="Name">{data.provider.superAdminName}</Row>
          <Row label="Bootstrap password">
            {data.provider.passwordFromEnvironment ? "from SUPER_ADMIN_PASSWORD" : "built-in bootstrap hash"}
          </Row>
          <Row label="Force reset on boot">
            {data.provider.forceResetEnabled ? <span className="text-destructive">enabled</span> : "off"}
          </Row>
          <Row label="Default organization">
            {data.provider.defaultOrgName} <code className="rounded bg-muted px-1 text-xs">{data.provider.defaultOrgSlug}</code>
          </Row>
        </Card>

        <Card title="Catalog">
          <Row label="Capabilities">{data.catalog.featuresAvailable} of {data.catalog.features} available</Row>
          <Row label="Credentialing requirements">{data.catalog.requirements ?? "—"}</Row>
        </Card>
      </div>

      {/* ── scheduled jobs ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-semibold text-plum">Scheduled work</h2>
            <p className="text-sm text-muted-foreground">
              {jobs?.schedulerEnabled
                ? `The API server attempts each job every ${jobs.intervalMinutes} minutes and skips the ones that are not due.`
                : "The in-process scheduler is off."}
              {jobs?.externalCronConfigured
                ? " An external cron can also drive them with the shared secret."
                : " No CRON_SECRET is set, so nothing outside this process can drive them."}
            </p>
          </div>
        </div>
        <div className="w-full overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
              <tr><th>Job</th><th>Every</th><th>Last run</th><th>Result</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
              {(jobs?.jobs ?? []).map((job) => (
                <tr key={job.name}>
                  <td>
                    <div className="font-medium">{job.name}</div>
                    <div className="text-xs text-muted-foreground">{job.description}</div>
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {job.everyMinutes >= 60 ? `${Math.round(job.everyMinutes / 60)} h` : `${job.everyMinutes} min`}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {job.lastRun ? relativeTime(job.lastRun.startedAt) : "never"}
                  </td>
                  <td>
                    {!job.lastRun ? (
                      <span className="text-muted-foreground">—</span>
                    ) : job.lastRun.ok === false ? (
                      <Badge variant="destructive">failed</Badge>
                    ) : job.lastRun.ok ? (
                      <span className="text-xs text-muted-foreground">{job.lastRun.detail}</span>
                    ) : (
                      <Badge variant="muted">running</Badge>
                    )}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={running === job.name}
                      onClick={async () => {
                        setRunning(job.name);
                        setNotice(null);
                        setError(null);
                        try {
                          const r = await platformApi.runJob(job.name);
                          setNotice(
                            r.ran
                              ? `${job.name}: ${r.ok ? r.detail ?? "done" : `failed — ${r.detail ?? "no detail"}`}`
                              : `${job.name} ran recently; skipped.`
                          );
                          await load();
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setRunning(null);
                        }
                      }}
                    >
                      {running === job.name ? "Running…" : "Run now"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── outbox ───────────────────────────────────────────────────────── */}
      {mail && (
        <section className="space-y-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-plum">Recent mail</h2>
            <p className="text-sm text-muted-foreground">
              What the system tried to send. Subjects and recipients only — bodies are never stored.
              {!data.mail.configured && " With no provider configured, these were written to the log instead of sent."}
            </p>
          </div>
          <div className="w-full overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
                <tr><th>When</th><th>Kind</th><th>From desk</th><th>To</th><th>Subject</th><th>Result</th></tr>
              </thead>
              <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border">
                {mail.map((msg) => (
                  <tr key={msg.id}>
                    <td className="whitespace-nowrap text-muted-foreground">{relativeTime(msg.createdAt)}</td>
                    <td><code className="rounded bg-muted px-1 text-xs">{msg.kind}</code></td>
                    <td className="text-muted-foreground">{msg.sender}</td>
                    <td className="text-plum-accent">{msg.recipient}</td>
                    <td>{msg.subject}</td>
                    <td>
                      <Badge
                        variant={
                          msg.status === "sent" ? "success" : msg.status === "failed" ? "destructive" : "muted"
                        }
                      >
                        {msg.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {mail.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nothing has been sent yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        To change any of these, edit the deployment&rsquo;s secrets (SESSION_IDLE_MINUTES, SESSION_MAX_DAYS,
        LOGIN_MAX_FAILURES, LOGIN_WINDOW_MINUTES, CORS_ORIGINS, REQUIRE_MFA_FOR_PLATFORM, SUPPORT_WINDOW_MAX_HOURS,
        AUDIT_RETENTION_YEARS, SENDGRID_API_KEY, SCHEDULER_ENABLED, CRON_SECRET, SUPER_ADMIN_*) and restart the API
        server; see docs/access-model.md.
      </p>
    </div>
  );
}
