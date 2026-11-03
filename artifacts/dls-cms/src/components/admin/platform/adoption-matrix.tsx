// components/admin/platform/adoption-matrix.tsx — the catalog crossed with
// every organization: is it available to that organization, has the
// organization switched it on, and which roles got it.
//
// For the Super Admin each cell is also a control: tier 1 for THAT
// organization alone. Every organization follows the switchboard until a
// capability is set here for it — on for this account only, or off for this
// account while the rest keep it. The organization's Admin still changes tier
// 2 in their own Settings.
"use client";

import { Fragment, useEffect, useState } from "react";
import { EMPLOYEE_ROLES, FEATURE_CATALOG, FEATURE_CATEGORIES, ROLE_LABELS, toFeatureView, type FeatureKey, type FeatureState } from "@workspace/features";
import { platformApi, type OrgAdoptionRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { FeatureStatusBadge } from "@/components/admin/feature-status-badge";

type Choice = "inherit" | "on" | "off";

const selectClass = "h-8 max-w-full rounded-btn border border-border bg-card px-1.5 text-xs disabled:opacity-60";

export function FeatureAdoptionMatrix({ canSwitch = false }: { canSwitch?: boolean }) {
  const [orgs, setOrgs] = useState<OrgAdoptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void platformApi.adoption().then((r) => setOrgs(r.organizations)).catch((e) => setError(errorMessage(e)));
  }, []);

  async function setForOrg(orgId: string, key: FeatureKey, choice: Choice) {
    const cell = `${orgId}:${key}`;
    setBusy(cell);
    setError(null);
    try {
      const res = await platformApi.setOrgFeature(orgId, key, choice === "inherit" ? null : choice === "on");
      setOrgs((current) =>
        current
          ? current.map((o) => (o.id === orgId ? { ...o, features: o.features.map((f) => (f.key === key ? res.state : f)) } : o))
          : current
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !orgs) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!orgs) return <p className="text-sm text-muted-foreground">Loading adoption…</p>;

  const stateOf = (org: OrgAdoptionRow, key: string) => org.features.find((f) => f.key === key);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Badge variant="success">On</Badge> switched on by the organization</span>
        <span className="flex items-center gap-1.5"><Badge variant="muted">Off</Badge> available, but the organization has not turned it on</span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">Not available</span> not available to this organization</span>
        {canSwitch && (
          <span className="flex items-center gap-1.5"><Badge variant="warning">Set here</Badge> this organization has its own tier-1 setting instead of following the switchboard</span>
        )}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:align-bottom [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/50 backdrop-blur">Capability</th>
              {orgs.map((o) => {
                const available = o.features.filter((f) => f.platformEnabled).length;
                const on = o.features.filter((f) => f.platformEnabled && f.orgEnabled).length;
                const own = o.features.filter((f) => f.platformOverride !== null && f.platformOverride !== undefined).length;
                return (
                  <th key={o.id} className="min-w-44">
                    <div className="text-foreground">{o.name}</div>
                    <div className="text-xs font-normal">
                      {on} of {available} available on
                      {own > 0 && <span className="ml-1">· {own} set here</span>}
                      {o.status !== "active" && <span className="ml-1 text-destructive">· suspended</span>}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border">
            {FEATURE_CATEGORIES.map((category) => {
              const rows = FEATURE_CATALOG.filter((f) => f.category === category);
              if (rows.length === 0) return null;
              return (
                <Fragment key={category}>
                  <tr className="bg-muted/30">
                    <td colSpan={orgs.length + 1} className="label-caps text-muted-foreground">{category}</td>
                  </tr>
                  {rows.map((f) => (
                    <tr key={f.key}>
                      <td className="sticky left-0 z-10 min-w-56 bg-card">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{f.label}</span>
                          <FeatureStatusBadge status={f.status} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <code className="rounded bg-muted px-1">{f.key}</code>
                          {!f.adminConfigurable && " · always on once available"}
                        </div>
                      </td>
                      {orgs.map((o) => {
                        const state = stateOf(o, f.key);
                        return (
                          <td key={o.id} className="align-top">
                            <div className="flex flex-col gap-1.5">
                              <AdoptionCell state={state} />
                              {canSwitch && state && (
                                <select
                                  id={`tier1-${o.id}-${f.key}`}
                                  aria-label={`${f.label} for ${o.name}`}
                                  className={selectClass}
                                  disabled={busy === `${o.id}:${f.key}`}
                                  value={state.platformOverride === true ? "on" : state.platformOverride === false ? "off" : "inherit"}
                                  onChange={(e) => void setForOrg(o.id, f.key, e.target.value as Choice)}
                                >
                                  <option value="inherit">
                                    Follows switchboard ({state.platformDefault ?? state.platformEnabled ? "available" : "not available"})
                                  </option>
                                  <option value="on">Available for this organization</option>
                                  <option value="off">Not available for this organization</option>
                                </select>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdoptionCell({ state }: { state: FeatureState | undefined }) {
  if (!state) return <span className="text-xs text-muted-foreground">?</span>;
  const own = state.platformOverride !== null && state.platformOverride !== undefined;
  if (!state.platformEnabled) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground" title="Not available to this organization">Not available</span>
        {own && <Badge variant="warning">Set here</Badge>}
      </div>
    );
  }
  const view = toFeatureView(state);
  if (!view.orgEnabled) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="muted">Off</Badge>
        {own && <Badge variant="warning">Set here</Badge>}
      </div>
    );
  }
  const granted = EMPLOYEE_ROLES.filter((r) => view.effectiveByRole[r]);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="success" className="w-fit">On</Badge>
        {own && <Badge variant="warning">Set here</Badge>}
      </div>
      <span className="text-[11px] text-muted-foreground">
        {view.def.employeeRoles.length === 0
          ? "Admin only"
          : granted.length === 0
            ? "Admin only so far"
            : `Admin + ${granted.map((r) => ROLE_LABELS[r]).join(", ")}`}
      </span>
    </div>
  );
}
