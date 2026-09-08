// components/admin/feature-switchboard.tsx — TIER 1. The provider decides
// which capabilities organizations may use at all. A switch here does not
// turn anything on inside an organization; it lets the organization's Admin
// turn it on (Settings → Feature access), unless the catalog marks it
// always-on, in which case it lights up immediately.
"use client";

import { useEffect, useState } from "react";
import { FEATURE_CATALOG, FEATURE_CATEGORIES, type FeatureKey } from "@workspace/features";
import { platformApi } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { FeatureStatusBadge } from "@/components/admin/feature-status-badge";

export function FeatureSwitchboard() {
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void platformApi
      .features()
      .then((r) => setEnabled(Object.fromEntries(r.features.map((f) => [f.key, f.enabled]))))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function toggle(key: FeatureKey, next: boolean) {
    setBusy(key);
    setError(null);
    const prev = enabled;
    setEnabled((s) => ({ ...(s ?? {}), [key]: next }));
    try {
      await platformApi.setFeature(key, next);
    } catch (e) {
      setEnabled(prev);
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !enabled) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!enabled) return <p className="text-sm text-muted-foreground">Loading switchboard…</p>;

  const on = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {on} of {FEATURE_CATALOG.length} capabilities are available to organizations.
        {" "}“Preview” features are built but still being hardened; “In development” ones have no screens yet, so the switch simply reserves them.
      </p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {FEATURE_CATEGORIES.map((category) => {
        const rows = FEATURE_CATALOG.filter((f) => f.category === category);
        if (rows.length === 0) return null;
        return (
          <section key={category} className="overflow-hidden rounded-card border border-border bg-card">
            <h3 className="label-caps border-b border-border bg-muted/50 px-4 py-2 text-muted-foreground">{category}</h3>
            <ul>
              {rows.map((f) => (
                <li key={f.key} className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 last:border-0">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.label}</span>
                      <FeatureStatusBadge status={f.status} />
                      {!f.adminConfigurable && (
                        <span className="text-xs text-muted-foreground">Always on once available</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-1">{f.key}</code>
                      {f.employeeRoles.length > 0
                        ? ` · grantable to ${f.employeeRoles.map((r) => r.replace("_", " ")).join(", ")}`
                        : " · Admin only"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ToggleSwitch
                      label={`Make ${f.label} available to organizations`}
                      checked={enabled[f.key] ?? false}
                      disabled={busy === f.key}
                      onCheckedChange={(v) => void toggle(f.key, v)}
                    />
                    <span className="text-[11px] text-muted-foreground">{enabled[f.key] ? "Available" : "Not available"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
