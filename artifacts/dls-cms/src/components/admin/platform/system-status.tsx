// components/admin/platform/system-status.tsx — the service as the provider
// sees it without a shell: process, database and migrations, the sign-in
// policy in force, how the provider account was bootstrapped, and the
// warnings that come out of that configuration. Secrets are never shown.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert, Info, RefreshCw } from "lucide-react";
import { platformApi, type SystemStatus } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtDuration } from "@/components/admin/platform/format";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await platformApi.system());
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
          <Row label="Build">{data.service.gitSha ? <code className="rounded bg-muted px-1 text-xs">{data.service.gitSha.slice(0, 12)}</code> : <span className="text-muted-foreground">not stamped (set GIT_SHA)</span>}</Row>
        </Card>

        <Card title="Database">
          <Row label="Connection">{data.database.ok ? <Badge variant="success">ok · {data.database.latencyMs} ms</Badge> : <Badge variant="destructive">failed</Badge>}</Row>
          <Row label="PostgreSQL">{data.database.serverVersion ?? "—"}</Row>
          <Row label="Migrations">{m ? `${m.applied} of ${m.total} applied` : "—"}</Row>
          <Row label="Latest">{m?.latestApplied ? <code className="rounded bg-muted px-1 text-xs">{m.latestApplied.tag}</code> : "—"}</Row>
          {m && m.pending.length > 0 && <Row label="Pending"><span className="text-destructive">{m.pending.join(", ")}</span></Row>}
          {data.database.error && <Row label="Error"><span className="text-destructive">{data.database.error}</span></Row>}
        </Card>

        <Card title="Sign-in policy">
          <Row label="Session cookie"><code className="rounded bg-muted px-1 text-xs">{data.signIn.cookieName}</code> · {data.signIn.cookieSecure ? "Secure" : "not Secure"}</Row>
          <Row label="Idle sign-out">{data.signIn.sessionIdleMinutes >= 60 ? `${Math.round(data.signIn.sessionIdleMinutes / 60)} h` : `${data.signIn.sessionIdleMinutes} min`}</Row>
          <Row label="Maximum session">{data.signIn.sessionMaxDays} day{data.signIn.sessionMaxDays === 1 ? "" : "s"}</Row>
          <Row label="Lock-out">{data.signIn.loginMaxFailures} failures in {data.signIn.loginWindowMinutes} min</Row>
          <Row label="Behind a proxy">{data.signIn.trustProxy ? "yes (client addresses from X-Forwarded-For)" : "no"}</Row>
          <Row label="Cross-site origins">{data.signIn.corsOrigins.length === 0 ? "none (same-origin only)" : data.signIn.corsOrigins.join(", ")}</Row>
        </Card>

        <Card title="Provider account">
          <Row label="Email">{data.provider.superAdminEmail}</Row>
          <Row label="Name">{data.provider.superAdminName}</Row>
          <Row label="Bootstrap password">{data.provider.passwordFromEnvironment ? "from SUPER_ADMIN_PASSWORD" : "built-in bootstrap hash"}</Row>
          <Row label="Force reset on boot">{data.provider.forceResetEnabled ? <span className="text-destructive">enabled</span> : "off"}</Row>
          <Row label="Provider accounts">{data.provider.platformAccounts}</Row>
          <Row label="Default organization">{data.provider.defaultOrgName} <code className="rounded bg-muted px-1 text-xs">{data.provider.defaultOrgSlug}</code></Row>
        </Card>

        <Card title="Catalog">
          <Row label="Capabilities">{data.catalog.featuresAvailable} of {data.catalog.features} available</Row>
          <Row label="Credentialing requirements">{data.catalog.requirements ?? "—"}</Row>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        To change any of these, edit the deployment&rsquo;s secrets (SESSION_IDLE_MINUTES, SESSION_MAX_DAYS, LOGIN_MAX_FAILURES,
        LOGIN_WINDOW_MINUTES, CORS_ORIGINS, SUPER_ADMIN_*) and restart the API server; see docs/access-model.md.
      </p>
    </div>
  );
}
