// components/admin/config-audit.tsx — who changed which switch/account, when.
// The labels and one-line summaries are shared with the provider's audit
// explorer so both screens describe an entry the same way.
"use client";

import { useEffect, useState } from "react";
import { orgApi, platformApi, type AuditEntry } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";

export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.password_changed": "Changed own password",
  "auth.impersonation_started": "Started viewing as",
  "auth.impersonation_stopped": "Stopped viewing as",
  "auth.login_failed": "Failed sign-in",
  "auth.mfa_enabled": "Turned on two-factor sign-in",
  "auth.mfa_disabled": "Turned off two-factor sign-in",
  "auth.mfa_recovery_codes_regenerated": "New recovery codes issued",
  "auth.recovery_code_used": "Signed in with a recovery code",
  "auth.invite_accepted": "Accepted an invitation",
  "auth.password_reset_requested": "Asked for a reset link",
  "auth.password_reset_completed": "Reset own password",
  "platform.bootstrap": "Platform bootstrapped",
  "platform.feature_toggled": "Provider switch",
  "platform.super_admin_password_reset": "Provider password reset",
  "platform.breakglass_created": "Break-glass account created",
  "platform.job_run": "Maintenance job run",
  "platform.audit_exported": "Audit log exported",
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "org.feature_updated": "Feature access changed",
  "org.decommissioned": "Organization decommissioned",
  "org.exported": "Organization exported",
  "user.created": "Account created",
  "user.updated": "Account updated",
  "user.password_reset": "Password reset issued",
  "user.sessions_revoked": "Signed out everywhere",
  "user.invite_sent": "Invitation sent",
  "session.revoked": "Session ended",
  "support.window_granted": "Support window opened",
  "support.window_revoked": "Support window closed early",
  "support.window_expired": "Support window expired",
  "support.window_requested": "Support access requested",
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

export function summarizeAudit(e: AuditEntry): string {
  const d = e.details ?? {};
  switch (e.action) {
    case "platform.feature_toggled":
      return `${e.targetId} → ${d.enabled ? "available" : "not available"}`;
    case "org.feature_updated": {
      const roles = Object.entries((d.roles as Record<string, boolean>) ?? {}).filter(([, v]) => v).map(([k]) => k.replace("_", " "));
      return `${e.targetId} → ${d.enabled ? "on" : "off"}${roles.length ? ` for ${roles.join(", ")}` : ""}`;
    }
    case "user.created":
      return `${d.fullName ?? ""} (${d.email ?? ""}) as ${String(d.role ?? "").replace("_", " ")}`;
    case "user.updated":
      return Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(", ");
    case "support.window_granted":
      return `${d.reason ?? ""}${d.hours ? ` · ${d.hours} hour${d.hours === 1 ? "" : "s"}` : ""}`;
    case "support.window_revoked":
    case "support.window_expired":
    case "support.window_requested":
      return String(d.reason ?? "");
    case "auth.login_failed":
      return String(d.reason ?? "").replace(/_/g, " ");
    case "platform.job_run":
      return `${e.targetId} → ${d.ok ? `ok, ${Number(d.items ?? 0)} item(s)` : "failed"}`;
    case "platform.audit_exported":
      return `${Number(d.rows ?? 0)} row(s)`;
    case "org.decommissioned":
      return `${d.reason ?? ""} · ${Number(d.accountsSuspended ?? 0)} account(s) suspended`;
    case "org.exported":
      return `${Number(d.users ?? 0)} account(s), ${Number(d.auditEntries ?? 0)} audit entries`;
    case "user.invite_sent":
      return `${d.email ?? ""}${d.status ? ` · ${d.status}` : ""}`;
    case "user.sessions_revoked":
      return `${d.fullName ?? ""} · ${Number(d.revoked ?? 0)} session${Number(d.revoked ?? 0) === 1 ? "" : "s"} ended`;
    case "session.revoked":
      return String(d.fullName ?? e.targetId ?? "");
    case "auth.impersonation_started":
    case "auth.impersonation_stopped":
      return String(d.target ?? e.impersonatingName ?? "");
    case "org.created":
      return String(d.name ?? "");
    case "org.updated":
      return Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(", ");
    default:
      return e.targetId ?? "";
  }
}

export function AuditTable({ entries, showOrg = false }: { entries: AuditEntry[]; showOrg?: boolean }) {
  return (
    <div className="w-full overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>What</th>
            {showOrg && <th>Organization</th>}
            <th>Detail</th>
          </tr>
        </thead>
        <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-muted-foreground">
                {new Date(e.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </td>
              <td>
                {e.actorName ?? "system"}
                {e.impersonatingName && e.action !== "auth.impersonation_started" && e.action !== "auth.impersonation_stopped" && (
                  <span className="text-xs text-muted-foreground"> as {e.impersonatingName}</span>
                )}
              </td>
              <td>{auditLabel(e.action)}</td>
              {showOrg && <td className="text-muted-foreground">{e.orgName ?? (e.orgId ? "—" : "Platform")}</td>}
              <td className="text-muted-foreground">{summarizeAudit(e)}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={showOrg ? 5 : 4} className="text-center text-muted-foreground">Nothing yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ConfigAudit({ scope, limit = 40 }: { scope: "platform" | "org"; limit?: number }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (scope === "platform" ? platformApi.audit(limit) : orgApi.audit(limit))
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(errorMessage(e)));
  }, [scope, limit]);

  if (error) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!entries) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <AuditTable entries={entries} showOrg={scope === "platform"} />;
}
