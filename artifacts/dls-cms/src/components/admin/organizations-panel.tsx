// components/admin/organizations-panel.tsx — the provider's view of every
// organization as a tenant: create it, hand it to its administrator, watch
// the hand-over complete, rename, suspend or reactivate it. Everyone else in
// the organization is on the Accounts screen; feature adoption is on its own
// screen. No client records are loaded here.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Download, Minus } from "lucide-react";
import { ROLE_LABELS } from "@workspace/features";
import { platformApi, type OrganizationPatch, type OrganizationRow, type OrgRole } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OneTimePassword } from "@/components/admin/one-time-password";
import { AccountRowActions } from "@/components/admin/platform/account-actions";
import { fmtDate, fmtDateTime } from "@/components/admin/platform/format";

interface OnboardingStep {
  label: string;
  done: boolean;
  hint: string;
}

/**
 * The hand-over, step by step, read straight off the data: an organization is
 * "live" once an administrator exists, has signed in with the one-time
 * password, replaced it with their own, and touched feature access.
 */
export function onboardingSteps(org: OrganizationRow): OnboardingStep[] {
  const admins = org.users.filter((u) => u.role === "Admin");
  const signedIn = admins.filter((a) => a.lastLoginAt !== null);
  return [
    { label: "Administrator created", done: admins.length > 0, hint: "Add the organization's Admin below." },
    { label: "Administrator signed in", done: signedIn.length > 0, hint: "Hand over the one-time password." },
    {
      label: "Own password set",
      done: signedIn.some((a) => !a.mustChangePassword),
      hint: "Happens automatically on the Admin's first sign-in.",
    },
    {
      label: "Feature access configured",
      done: org.featuresConfigured > 0,
      hint: "The Admin chooses what employees see in Settings → Feature access.",
    },
  ];
}

export function OrganizationsPanel({ selfId }: { selfId: string }) {
  const [orgs, setOrgs] = useState<OrganizationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await platformApi.organizations();
      setOrgs(r.organizations);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !orgs) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!orgs) return <p className="text-sm text-muted-foreground">Loading organizations…</p>;

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {issued && <OneTimePassword email={issued.email} password={issued.password} onDismiss={() => setIssued(null)} />}

      {orgs.map((org) => (
        <OrganizationCard
          key={org.id}
          org={org}
          selfId={selfId}
          busy={busy}
          onRun={run}
          onReload={load}
          onIssued={(email, password) => setIssued({ email, password })}
        />
      ))}

      <NewOrganizationForm onCreated={() => void load()} />
    </div>
  );
}

function OrganizationCard({
  org,
  selfId,
  busy,
  onRun,
  onReload,
  onIssued,
}: {
  org: OrganizationRow;
  selfId: string;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<void>) => Promise<void>;
  onReload: () => Promise<void>;
  onIssued: (email: string, password: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(org.name);
  const steps = onboardingSteps(org);
  const admins = org.users.filter((u) => u.role === "Admin");
  const employees = org.users.filter((u) => u.role !== "Admin");
  const schedulers = employees.filter((u) => u.role === "Scheduler").length;
  const fieldStaff = employees.filter((u) => u.role === "Field_Staff").length;
  const done = steps.filter((s) => s.done).length;

  return (
    <section className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {renaming ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void onRun(`rename:${org.id}`, async () => {
                  await platformApi.updateOrganization(org.id, { name: name.trim() });
                  setRenaming(false);
                });
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-72" aria-label="Organization name" required minLength={2} />
              <Button type="submit" size="sm" disabled={busy === `rename:${org.id}` || name.trim().length < 2}>Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setRenaming(false); setName(org.name); }}>Cancel</Button>
            </form>
          ) : (
            <h3 className="font-serif text-lg font-semibold text-plum">{org.name}</h3>
          )}
          <p className="text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1">{org.slug}</code> · created {fmtDate(org.createdAt)} · {org.users.length} account{org.users.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={org.status === "active" ? "success" : org.status === "suspended" ? "warning" : "destructive"}>
            {org.status}
          </Badge>
          {!renaming && org.status !== "decommissioned" && (
            <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>Rename</Button>
          )}
          <a
            href={platformApi.organizationExportUrl(org.id)}
            className="inline-flex items-center gap-1 rounded-btn border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            title="Download this organization's configuration, accounts and audit history as JSON."
          >
            <Download className="h-3.5 w-3.5" /> Export
          </a>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === `org:${org.id}`}
            title={
              org.status === "active"
                ? "Signs everyone in the organization out and blocks sign-in until reactivated."
                : "Lets the organization sign in again."
            }
            onClick={() =>
              void onRun(`org:${org.id}`, async () => {
                await platformApi.updateOrganization(org.id, { status: org.status === "active" ? "suspended" : "active" });
              })
            }
          >
            {org.status === "active" ? "Suspend organization" : "Reactivate"}
          </Button>
        </div>
      </div>

      {org.status === "decommissioned" && (
        <div className="border-b border-border bg-pill-danger px-4 py-3 text-sm text-pill-danger-fg">
          <span className="font-medium">Decommissioned {org.decommissionedAt ? fmtDate(org.decommissionedAt) : ""}.</span>{" "}
          {org.decommissionReason} Every account in it is suspended. Reactivating restores sign-in but not the
          accounts, which are turned back on one at a time.
        </div>
      )}

      {/* hand-over checklist */}
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label-caps text-muted-foreground">Hand-over</span>
          <span className="text-xs text-muted-foreground">{done === steps.length ? "Complete" : `${done} of ${steps.length} steps`}</span>
        </div>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2" title={s.done ? undefined : s.hint}>
              {s.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-pill-success-fg" aria-label="done" />
              ) : (
                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-label="not yet" />
              )}
              <span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* administrators */}
      <div className="px-4 pt-3">
        <span className="label-caps text-muted-foreground">Administrators</span>
      </div>
      <table className="w-full text-sm">
        <thead className="[&_th]:h-9 [&_th]:px-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
          <tr><th>Name</th><th>Email</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></tr>
        </thead>
        <tbody className="[&_td]:px-4 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
          {admins.map((u) => (
            <tr key={u.id} className={u.status === "Suspended" ? "opacity-60" : undefined}>
              <td className="font-medium">{u.fullName}</td>
              <td className="text-plum-accent">{u.email}</td>
              <td>
                <Badge variant={u.status === "Active" ? "success" : "muted"}>{u.status}</Badge>
                {u.mustChangePassword && <span className="ml-2 text-xs text-muted-foreground">temp password</span>}
              </td>
              <td className="text-muted-foreground">{fmtDateTime(u.lastLoginAt)}</td>
              <td>
                <AccountRowActions user={u} selfId={selfId} onChanged={onReload} onIssued={onIssued} />
              </td>
            </tr>
          ))}
          {admins.length === 0 && (
            <tr><td colSpan={5} className="text-center text-muted-foreground">No administrator yet — add one below so the organization can run itself.</td></tr>
          )}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {employees.length === 0
            ? "No employee accounts yet."
            : `${employees.length} employee account${employees.length === 1 ? "" : "s"} (${schedulers} ${ROLE_LABELS.Scheduler}${schedulers === 1 ? "" : "s"}, ${fieldStaff} ${ROLE_LABELS.Field_Staff})`}
          {" · "}
          {org.featuresConfigured} capabilit{org.featuresConfigured === 1 ? "y" : "ies"} configured by the organization
        </span>
        <span className="flex gap-3">
          <Link href={`/admin/platform/accounts?org=${org.id}`} className="text-plum underline">All accounts</Link>
          <Link href="/admin/platform/adoption" className="text-plum underline">Feature adoption</Link>
        </span>
      </div>

      <ContractDetails org={org} busy={busy} onRun={onRun} />

      {org.status !== "decommissioned" && (
        <AddAccountForm
          orgId={org.id}
          orgName={org.name}
          onCreated={(email, temp) => {
            if (temp) onIssued(email, temp);
            void onReload();
          }}
        />
      )}

      {org.status !== "decommissioned" && <DecommissionForm org={org} busy={busy} onRun={onRun} />}
    </section>
  );
}

function AddAccountForm({
  orgId,
  orgName,
  onCreated,
}: {
  orgId: string;
  orgName: string;
  onCreated: (email: string, temporaryPassword: string | null) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("Admin");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const r = await platformApi.createUser({ orgId, email, fullName, role, password: password || undefined });
      setOk(`${r.user.fullName} added as ${ROLE_LABELS[r.user.role]} of ${orgName}.`);
      onCreated(r.user.email, r.temporaryPassword);
      setFullName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="border-t border-border bg-muted/30">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add an account to {orgName}</summary>
      <form onSubmit={submit} className="space-y-3 px-4 pb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${orgId}`}>Full name</Label>
            <Input id={`name-${orgId}`} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Lisa Torres" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`email-${orgId}`}>Email</Label>
            <Input id={`email-${orgId}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`role-${orgId}`}>Role</Label>
            <select
              id={`role-${orgId}`}
              className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
            >
              <option value="Admin">Admin (organization owner)</option>
              <option value="Scheduler">Scheduler</option>
              <option value="Field_Staff">Field Staff</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`pw-${orgId}`}>Password (optional)</Label>
            <Input id={`pw-${orgId}`} type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to generate" />
          </div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {ok && <p className="text-sm text-pill-success-fg" role="status">{ok}</p>}
        <Button type="submit" size="sm" disabled={pending || !fullName || !email}>
          {pending ? "Adding…" : "Add account"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Create the organization&rsquo;s Admin here; that Admin creates their own employees from Settings &rarr; Accounts.
          The one-time password is shown exactly once.
        </p>
      </form>
    </details>
  );
}

function NewOrganizationForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="rounded-card border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">New organization</summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            await platformApi.createOrganization({ name });
            setName("");
            onCreated();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="min-w-64 space-y-1.5">
          <Label htmlFor="new-org-name">Organization name</Label>
          <Input id="new-org-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <Button type="submit" size="sm" disabled={pending || name.trim().length < 2}>{pending ? "Creating…" : "Create"}</Button>
        {error && <p className="w-full text-sm text-destructive" role="alert">{error}</p>}
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        Each organization has its own administrators, employees and feature settings. It starts with the launch
        defaults; the provider switchboard decides what it may use beyond them.
      </p>
    </details>
  );
}


/**
 * The commercial side of a tenant: who answers the phone, which time zone
 * their day is measured in, and when the Business Associate Agreement was
 * signed and lapses. Without these the provider keeps the contract in their
 * head, and a lapsed BAA is invisible until it matters.
 */
function ContractDetails({
  org,
  busy,
  onRun,
}: {
  org: OrganizationRow;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const [form, setForm] = useState<OrganizationPatch>({
    primaryContactName: org.primaryContactName ?? "",
    primaryContactEmail: org.primaryContactEmail ?? "",
    primaryContactPhone: org.primaryContactPhone ?? "",
    timeZone: org.timeZone ?? "America/Denver",
    baaSignedOn: org.baaSignedOn ?? "",
    baaExpiresOn: org.baaExpiresOn ?? "",
    contractNotes: org.contractNotes ?? "",
  });
  const [saved, setSaved] = useState(false);
  const baaDays = org.baaExpiresOn ? Math.ceil((Date.parse(`${org.baaExpiresOn}T00:00:00Z`) - Date.now()) / 86_400_000) : null;

  return (
    <details className="border-t border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Contract &amp; contact
        {org.baaExpiresOn ? (
          <span className={`ml-2 text-xs font-normal ${baaDays !== null && baaDays <= 60 ? "text-destructive" : "text-muted-foreground"}`}>
            BAA {baaDays !== null && baaDays < 0 ? `lapsed ${fmtDate(org.baaExpiresOn)}` : `expires ${fmtDate(org.baaExpiresOn)}`}
          </span>
        ) : (
          <span className="ml-2 text-xs font-normal text-muted-foreground">no BAA recorded</span>
        )}
      </summary>
      <form
        className="space-y-3 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          void onRun(`contract:${org.id}`, async () => {
            await platformApi.updateOrganization(org.id, {
              ...form,
              primaryContactName: form.primaryContactName || null,
              primaryContactEmail: form.primaryContactEmail || null,
              primaryContactPhone: form.primaryContactPhone || null,
              baaSignedOn: form.baaSignedOn || null,
              baaExpiresOn: form.baaExpiresOn || null,
              contractNotes: form.contractNotes || null,
            });
            setSaved(true);
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`contact-name-${org.id}`}>Primary contact</Label>
            <Input
              id={`contact-name-${org.id}`}
              value={form.primaryContactName ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, primaryContactName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`contact-email-${org.id}`}>Email</Label>
            <Input
              id={`contact-email-${org.id}`}
              type="email"
              value={form.primaryContactEmail ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, primaryContactEmail: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`contact-phone-${org.id}`}>Phone</Label>
            <Input
              id={`contact-phone-${org.id}`}
              value={form.primaryContactPhone ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, primaryContactPhone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`baa-signed-${org.id}`}>BAA signed</Label>
            <Input
              id={`baa-signed-${org.id}`}
              type="date"
              value={form.baaSignedOn ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, baaSignedOn: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`baa-expires-${org.id}`}>BAA expires</Label>
            <Input
              id={`baa-expires-${org.id}`}
              type="date"
              value={form.baaExpiresOn ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, baaExpiresOn: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tz-${org.id}`}>Time zone</Label>
            <Input
              id={`tz-${org.id}`}
              value={form.timeZone ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, timeZone: e.target.value }))}
              placeholder="America/Denver"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`notes-${org.id}`}>Contract notes</Label>
          <textarea
            id={`notes-${org.id}`}
            className="min-h-16 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm"
            value={form.contractNotes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, contractNotes: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={busy === `contract:${org.id}`}>
            {busy === `contract:${org.id}` ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm text-pill-success-fg" role="status">Saved.</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          The portal warns the organization&rsquo;s administrators 60, 30 and 7 days before the agreement lapses, and once
          on the day.
        </p>
      </form>
    </details>
  );
}

/**
 * The end of the relationship. Suspending is a pause; this is a close-down, so
 * it also suspends every account and ends every session. Typing the slug is
 * the "are you sure": it cannot be clicked through by accident.
 */
function DecommissionForm({
  org,
  busy,
  onRun,
}: {
  org: OrganizationRow;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const [confirmSlug, setConfirmSlug] = useState("");
  const [reason, setReason] = useState("");

  return (
    <details className="border-t border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-destructive">Decommission</summary>
      <form
        className="space-y-3 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onRun(`decommission:${org.id}`, async () => {
            await platformApi.decommissionOrganization(org.id, { confirmSlug, reason });
            setConfirmSlug("");
            setReason("");
          });
        }}
      >
        <p className="text-sm text-muted-foreground">
          Closing {org.name} down suspends all {org.users.length} of its accounts and ends every session. Export the
          organization first — this is the end of the relationship, not a pause.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`decomm-reason-${org.id}`}>Reason</Label>
            <Input
              id={`decomm-reason-${org.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contract ended; data exported"
              required
              minLength={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`decomm-slug-${org.id}`}>
              Type <code className="rounded bg-muted px-1">{org.slug}</code> to confirm
            </Label>
            <Input id={`decomm-slug-${org.id}`} value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} required />
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={busy === `decommission:${org.id}` || confirmSlug !== org.slug || reason.trim().length < 4}
        >
          {busy === `decommission:${org.id}` ? "Closing…" : "Decommission this organization"}
        </Button>
      </form>
    </details>
  );
}
