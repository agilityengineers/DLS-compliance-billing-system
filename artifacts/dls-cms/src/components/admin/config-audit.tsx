// components/admin/config-audit.tsx — who changed which switch/account, when.
"use client";

import { useEffect, useState } from "react";
import { orgApi, platformApi, type AuditEntry } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";

const LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.password_changed": "Changed own password",
  "auth.impersonation_started": "Started viewing as",
  "auth.impersonation_stopped": "Stopped viewing as",
  "platform.bootstrap": "Platform bootstrapped",
  "platform.feature_toggled": "Provider switch",
  "platform.super_admin_password_reset": "Provider password reset",
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "org.feature_updated": "Feature access changed",
  "user.created": "Account created",
  "user.updated": "Account updated",
  "user.password_reset": "Password reset issued",
};

function summarize(e: AuditEntry): string {
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
    case "auth.impersonation_started":
    case "auth.impersonation_stopped":
      return String(d.target ?? e.impersonatingName ?? "");
    case "org.created":
      return String(d.name ?? "");
    default:
      return e.targetId ?? "";
  }
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
  return (
    <div className="w-full overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
          <tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>
        </thead>
        <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-muted-foreground">{new Date(e.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td>
                {e.actorName ?? "system"}
                {e.impersonatingName && e.action !== "auth.impersonation_started" && e.action !== "auth.impersonation_stopped" && (
                  <span className="text-xs text-muted-foreground"> as {e.impersonatingName}</span>
                )}
              </td>
              <td>{LABELS[e.action] ?? e.action}</td>
              <td className="text-muted-foreground">{summarize(e)}</td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground">Nothing yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
