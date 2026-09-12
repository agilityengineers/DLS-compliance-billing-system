// components/admin/feature-access-panel.tsx — TIER 2. The organization's
// Admin turns provider-enabled capabilities on or off for the organization
// and picks which employee roles may use each one. Everything the provider
// has not made available shows as locked; spine features cannot be switched
// off (their role grants can still be trimmed).
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMPLOYEE_ROLES,
  FEATURE_CATEGORIES,
  ROLE_LABELS,
  toFeatureView,
  type EmployeeRole,
  type FeatureKey,
  type FeatureState,
  type FeatureView,
} from "@workspace/features";
import { orgApi } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { FeatureStatusBadge } from "@/components/admin/feature-status-badge";

export function FeatureAccessPanel() {
  const router = useRouter();
  const [states, setStates] = useState<FeatureState[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void orgApi.features().then((r) => setStates(r.features)).catch((e) => setError(errorMessage(e)));
  }, []);

  async function save(key: FeatureKey, patch: { enabled?: boolean; roles?: Partial<Record<EmployeeRole, boolean>> }) {
    setBusy(key);
    setError(null);
    try {
      const r = await orgApi.setFeature(key, patch);
      setStates((s) => (s ?? []).map((x) => (x.key === key ? { ...x, orgEnabled: r.orgEnabled, roles: r.roles } : x)));
      router.refresh(); // menus and gates read the new state on the next render
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !states) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!states) return <p className="text-sm text-muted-foreground">Loading feature access…</p>;
  const views = states.map(toFeatureView);
  const available = views.filter((v) => v.platformEnabled).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {available} of {views.length} capabilities are available to your organization. Admins always have every
        capability that is on; employees get only what you grant to their role.
      </p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {FEATURE_CATEGORIES.map((category) => {
        const rows = views.filter((v) => v.def.category === category);
        if (rows.length === 0) return null;
        return (
          <section key={category} className="overflow-hidden rounded-card border border-border bg-card">
            <h3 className="label-caps border-b border-border bg-muted/50 px-4 py-2 text-muted-foreground">{category}</h3>
            <ul>
              {rows.map((v) => (
                <FeatureRow key={v.key} view={v} busy={busy === v.key} onSave={(patch) => void save(v.key, patch)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function FeatureRow({
  view,
  busy,
  onSave,
}: {
  view: FeatureView;
  busy: boolean;
  onSave: (patch: { enabled?: boolean; roles?: Partial<Record<EmployeeRole, boolean>> }) => void;
}) {
  const { def } = view;
  const locked = view.adminLockReason;
  return (
    <li className={`border-b border-border px-4 py-3 last:border-0 ${!view.platformEnabled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{def.label}</span>
            <FeatureStatusBadge status={def.status} />
            {locked === "not_available" && <span className="text-xs text-muted-foreground">Not enabled by your provider</span>}
            {locked === "always_on" && <span className="text-xs text-muted-foreground">Always on</span>}
          </div>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ToggleSwitch
            label={`${def.label} for the organization`}
            checked={view.orgEnabled && view.platformEnabled}
            disabled={busy || !view.adminCanToggle}
            onCheckedChange={(v) => onSave({ enabled: v })}
          />
          <span className="text-[11px] text-muted-foreground">
            {!view.platformEnabled ? "Unavailable" : view.orgEnabled ? "On" : "Off"}
          </span>
        </div>
      </div>
      {def.employeeRoles.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-xs text-muted-foreground">Who may use it:</span>
          <span className="text-xs">Admin (always)</span>
          {EMPLOYEE_ROLES.filter((r) => def.employeeRoles.includes(r)).map((r) => (
            <label key={r} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#5F7161]"
                checked={view.roles[r] === true}
                disabled={busy || !view.platformEnabled || !view.orgEnabled}
                onChange={(e) => onSave({ roles: { [r]: e.target.checked } })}
              />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Admin only.</p>
      )}
    </li>
  );
}
