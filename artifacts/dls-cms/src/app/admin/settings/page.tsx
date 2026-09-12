// app/admin/settings/page.tsx — Settings & users (ADMIN-ONLY):
// accounts in the organization · feature access per role (tier 2) · the
// permission matrix. The provider's tier-1 switches live in the platform
// console; whatever it has not made available shows here as locked.
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { PERMISSION_MATRIX, ROLE_LABELS } from "@/lib/rbac/roles";
import { Table, THead, TBody } from "@/components/ui/table";
import { AccountsPanel } from "@/components/admin/accounts-panel";
import { FeatureAccessPanel } from "@/components/admin/feature-access-panel";
import { ConfigAudit } from "@/components/admin/config-audit";
import { SupportAccessPanel } from "@/components/admin/support-access-panel";
import { MfaPanel } from "@/components/admin/mfa-panel";
import { Check, Minus } from "lucide-react";

const MATRIX_ROLES = ["Super_Admin", "Platform_Support", "Admin", "Scheduler", "Field_Staff"] as const;

export default async function SettingsPage() {
  const { ctx, denied } = await checkAccess({ roles: ["Admin"] });
  if (denied) return denied;
  const apiAuth = isApiAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Settings &amp; users</h1>
        <p className="text-sm text-muted-foreground">
          Accounts for {ctx.org?.name ?? "your organization"}, which capabilities each role may use, and the permission matrix.
        </p>
      </div>

      {/* ── Accounts ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Accounts</h2>
          <p className="text-sm text-muted-foreground">
            People who can sign in. Synthetic demo staff (Maria Vega and friends) are not accounts; they
            appear only in schedules and staff lists while the demo dataset is in use.
          </p>
        </div>
        {apiAuth ? (
          <AccountsPanel selfId={ctx.realUser!.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Account management needs the API server (real sign-in mode).</p>
        )}
      </section>

      {/* ── Feature access (tier 2) ──────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Feature access</h2>
          <p className="text-sm text-muted-foreground">
            Turn capabilities on or off for your organization and choose which employee roles get them.
            Billing, Payroll, Staff &amp; credentials and Settings stay Admin-only regardless.
          </p>
        </div>
        {apiAuth ? (
          <FeatureAccessPanel />
        ) : (
          <p className="text-sm text-muted-foreground">Feature switches need the API server (real sign-in mode).</p>
        )}
      </section>

      {/* ── Support access (the organization's side of review decision D-02) ── */}
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Support access</h2>
          <p className="text-sm text-muted-foreground">
            Let your provider see the app as one of your people, for a set time, when you need help. They cannot open
            your records any other way, and cannot open this door themselves.
          </p>
        </div>
        {apiAuth ? (
          <SupportAccessPanel />
        ) : (
          <p className="text-sm text-muted-foreground">Support windows need the API server (real sign-in mode).</p>
        )}
      </section>

      {/* ── Your own sign-in ──────────────────────────────────────────── */}
      {apiAuth && (
        <section className="space-y-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-plum">Your sign-in</h2>
            <p className="text-sm text-muted-foreground">
              Your account can run the whole organization, so it is worth more than a password alone.
            </p>
          </div>
          <MfaPanel enabled={ctx.mfa.enabled} required={ctx.mfa.required} />
        </section>
      )}

      {/* ── Permission matrix ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-plum">Permission matrix</h2>
        <p className="text-sm text-muted-foreground">
          The hierarchy at a glance: the provider configures the platform; the Admin runs the organization;
          employees get what the Admin grants. &ldquo;When enabled&rdquo; rows also depend on the switches above.
        </p>
        <Table>
          <THead>
            <tr>
              <th>Capability</th>
              {MATRIX_ROLES.map((r) => (
                <th key={r} className="text-center">{ROLE_LABELS[r]}</th>
              ))}
            </tr>
          </THead>
          <TBody>
            {PERMISSION_MATRIX.map((row) => (
              <tr key={row.capability}>
                <td>{row.capability}</td>
                {MATRIX_ROLES.map((r) => (
                  <td key={r} className="text-center">
                    {row.roles.includes(r) ? (
                      <Check className="mx-auto h-4 w-4 text-pill-success-fg" aria-label="allowed" />
                    ) : (
                      <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="not allowed" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </TBody>
        </Table>
      </section>

      {/* ── Configuration audit ───────────────────────────────────────── */}
      {apiAuth && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold text-plum">Account &amp; access changes</h2>
          <ConfigAudit scope="org" />
        </section>
      )}
    </div>
  );
}
