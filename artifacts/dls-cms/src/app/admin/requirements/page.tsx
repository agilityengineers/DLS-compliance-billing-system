// app/admin/requirements/page.tsx — the credentialing requirements registry
// (ADMIN-ONLY).
//
// The rules that gate everything: which credentials exist, which are required,
// and which block a staff account from delivering billable services. Claim
// readiness (lib/billing/readiness.ts) and the staff roster both read from
// here, so a policy change is a toggle rather than a deploy.
import { checkAccess } from "@/lib/rbac/access";
import { listRequirements, listStaffCredentials } from "@/lib/data/repo-credentialing";
import { listUsers } from "@/lib/data/repo-core";
import { listReliasCompletions, listReliasCourses } from "@/lib/data/repo-business";
import { byCategory, evaluateAndSummarize, NEEDS_REVIEW } from "@workspace/credentialing";
import { agencyTodayIso } from "@/lib/time/agency";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { Badge } from "@/components/ui/badge";
import { RequirementToggles } from "@/components/admin/requirement-toggles";
import { RequirementVerification } from "@/components/admin/requirement-verification";

export default async function RequirementsPage() {
  // The registry configures staff.credentials rather than being a capability
  // of its own, so it rides that feature's switch.
  const { denied } = await checkAccess({ feature: "staff.credentials", roles: ["Admin"] });
  if (denied) return denied;

  const [requirements, credentials, users, courses, completions] = await Promise.all([
    listRequirements(),
    listStaffCredentials(),
    listUsers(),
    listReliasCourses(),
    listReliasCompletions()
  ]);
  const today = agencyTodayIso();

  // Roster impact, so a toggle's consequence is visible before it is flipped.
  const roster = users
    .filter((u) => u.status === "Active")
    .map((staff) => ({
      staff,
      ...evaluateAndSummarize({
        requirements, staff, credentials, courses, completions, today
      })
    }));

  const requiredCount = requirements.filter((r) => r.required).length;
  const gatingCount = requirements.filter((r) => r.required && r.gating).length;
  const needsReview = requirements.filter((r) => NEEDS_REVIEW.includes(r.verificationStatus));
  const notReady = roster.filter((r) => !r.summary.ready);
  const blocked = roster.filter((r) => r.summary.claimBlockers.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Credentialing requirements</h1>
        <p className="text-sm text-muted-foreground">
          The rules that gate everything. <strong>Required</strong> puts an item on every matching
          staff member&rsquo;s checklist. <strong>Gating</strong> means it must be verified before
          that account can deliver billable services &mdash; and a <em>lapsed</em> gating item blocks
          the claim. Changing a toggle takes effect immediately across Staff and Billing.
        </p>
      </div>

      {needsReview.length > 0 && (
        <div className="rounded-card border border-pill-warning-fg/30 bg-pill-warning p-4 text-sm text-pill-warning-fg">
          <strong>{needsReview.length} of {requirements.length} requirements rest on a citation nobody has checked.</strong>{" "}
          They were seeded from secondary sources as a starting point, not read out of the rule text.
          Confirm each against the primary source and record the sign-off below — until then, treat
          them as prompts rather than as settled law.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Requirements defined" value={requirements.length} sub={`${byCategory(requirements).length} categories`} />
        <Stat label="Currently required" value={requiredCount} sub={`${requirements.length - requiredCount} optional`} />
        <Stat label="Gating activation" value={gatingCount} sub="Must clear before Active" />
        <Stat
          label="Citations to check"
          value={needsReview.length}
          sub={needsReview.length > 0 ? "Not yet verified against the rule" : "All checked or agency policy"}
          tone={needsReview.length > 0 ? "warning" : "ok"}
        />
        <Stat
          label="Staff not yet clear"
          value={notReady.length}
          sub={blocked.length > 0 ? `${blocked.length} blocking claims today` : "No claims blocked"}
          tone={blocked.length > 0 ? "danger" : notReady.length > 0 ? "warning" : "ok"}
        />
      </div>

      {byCategory(requirements).map(({ category, items }) => (
        <section key={category} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2>
          <div className="overflow-hidden rounded-card border border-border bg-card">
            {items.map((r, i) => (
              <div
                key={r.id}
                className={`flex flex-wrap items-center gap-4 p-4 ${i > 0 ? "border-t border-border" : ""} ${r.required ? "" : "opacity-60"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.label}</span>
                    {r.automated && <Badge variant="success">Auto{r.vendor ? ` · ${r.vendor}` : ""}</Badge>}
                    {!r.automated && r.vendor && <Badge variant="muted">{r.vendor}</Badge>}
                    {r.renewsMonths && <Badge variant="warning">renews {r.renewsMonths} mo</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.note} · applies to {r.appliesTo.map(roleLabel).join(", ")}
                    {r.source.kind === "training" && " · evidence from training records and Relias"}
                    {r.source.kind === "license" && " · evidence from the staff licence record"}
                  </p>
                </div>
                <RequirementToggles requirementId={r.id} required={r.required} gating={r.gating} />
                <div className="w-full">
                  <RequirementVerification
                    requirementId={r.id}
                    status={r.verificationStatus}
                    citation={r.authorityCitation}
                    citationUrl={r.authorityUrl}
                    note={r.verificationNote}
                    verifiedOn={r.verifiedOn}
                    verifiedBy={r.verifiedBy}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <h2 className="font-serif text-lg font-semibold text-plum">Roster impact</h2>
        <p className="text-sm text-muted-foreground">
          How every active account stands against the registry as it is configured right now. A
          credential inside its renewal window is a warning; only a lapsed or failed one blocks a claim.
        </p>
        <div className="overflow-hidden rounded-card border border-border bg-card">
          {roster.map(({ staff, summary }, i) => (
            <div key={staff.id} className={`flex flex-wrap items-center gap-4 p-4 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{staff.full_name}</span>
                  <span className="text-sm text-muted-foreground">{ROLE_LABELS[staff.role]}</span>
                </div>
                {summary.claimBlockers.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {summary.claimBlockers.map((b) => (
                      <li key={b} className="text-sm text-destructive">{b}</li>
                    ))}
                  </ul>
                ) : summary.outstanding.length > 0 ? (
                  // Outstanding but nothing lapsed: this account cannot be
                  // activated, yet it blocks no claim. Name what is missing.
                  <p className="mt-1 text-sm text-muted-foreground">
                    Awaiting {summary.outstanding.map((c) => c.requirement.label).join(" · ")}
                  </p>
                ) : summary.expiring.length > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {summary.expiring.map((c) => c.detail).join(" ")}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">All required credentialing verified.</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-sm text-muted-foreground">
                  {summary.done}/{summary.total}
                </span>
                <Badge variant={summary.claimBlockers.length > 0 ? "destructive" : summary.ready ? "success" : "warning"}>
                  {summary.claimBlockers.length > 0 ? "Blocking claims" : summary.ready ? "Clear" : "Outstanding"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The registry stores roles as plain strings so the engine stays free of app
 * types; anything the app does not know about renders as written.
 */
function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role.replace(/_/g, " ");
}

function Stat({
  label, value, sub, tone = "neutral"
}: {
  label: string;
  value: number | string;
  sub: string;
  tone?: "neutral" | "ok" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-pill-danger-fg"
      : tone === "warning" ? "text-pill-warning-fg"
        : tone === "ok" ? "text-pill-success-fg"
          : "text-plum";
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
