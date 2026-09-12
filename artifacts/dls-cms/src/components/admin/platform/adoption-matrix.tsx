// components/admin/platform/adoption-matrix.tsx — the catalog crossed with
// every organization: has the provider made it available, has the
// organization switched it on, and which roles got it. Read-only; the
// provider changes tier 1 on the switchboard and the organization's Admin
// changes tier 2 in their own Settings.
"use client";

import { Fragment, useEffect, useState } from "react";
import { EMPLOYEE_ROLES, FEATURE_CATALOG, FEATURE_CATEGORIES, ROLE_LABELS, toFeatureView, type FeatureState } from "@workspace/features";
import { platformApi, type OrgAdoptionRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { FeatureStatusBadge } from "@/components/admin/feature-status-badge";

export function FeatureAdoptionMatrix() {
  const [orgs, setOrgs] = useState<OrgAdoptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void platformApi.adoption().then((r) => setOrgs(r.organizations)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!orgs) return <p className="text-sm text-muted-foreground">Loading adoption…</p>;

  const stateOf = (org: OrgAdoptionRow, key: string) => org.features.find((f) => f.key === key);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Badge variant="success">On</Badge> switched on by the organization</span>
        <span className="flex items-center gap-1.5"><Badge variant="muted">Off</Badge> available, but the organization has not turned it on</span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">Not available</span> the provider has not made it available</span>
      </div>

      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:align-bottom [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/50 backdrop-blur">Capability</th>
              {orgs.map((o) => {
                const available = o.features.filter((f) => f.platformEnabled).length;
                const on = o.features.filter((f) => f.platformEnabled && f.orgEnabled).length;
                return (
                  <th key={o.id} className="min-w-40">
                    <div className="text-foreground">{o.name}</div>
                    <div className="text-xs font-normal">
                      {on} of {available} available on{o.status !== "active" && <span className="ml-1 text-destructive">· suspended</span>}
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
                      {orgs.map((o) => (
                        <td key={o.id} className="align-top">
                          <AdoptionCell state={stateOf(o, f.key)} />
                        </td>
                      ))}
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
  if (!state.platformEnabled) {
    return <span className="text-xs text-muted-foreground" title="The provider has not made this available">Not available</span>;
  }
  const view = toFeatureView(state);
  if (!view.orgEnabled) return <Badge variant="muted">Off</Badge>;
  const granted = EMPLOYEE_ROLES.filter((r) => view.effectiveByRole[r]);
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="success" className="w-fit">On</Badge>
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
