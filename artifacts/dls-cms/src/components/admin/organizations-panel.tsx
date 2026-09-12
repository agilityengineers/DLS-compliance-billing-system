// components/admin/organizations-panel.tsx — the provider's view of every
// organization as a tenant: create it, hand it to its administrator, watch
// the hand-over complete, rename, suspend or reactivate it. Everyone else in
// the organization is on the Accounts screen; feature adoption is on its own
// screen. No client records are loaded here.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { ROLE_LABELS } from "@workspace/features";
import { platformApi, type OrganizationRow, type OrgRole } from "@/lib/api/admin";
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
          <Badge variant={org.status === "active" ? "success" : "destructive"}>{org.status}</Badge>
          {!renaming && (
            <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>Rename</Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy === `org:${org.id}`}
            title={org.status === "active" ? "Signs everyone in the organization out and blocks sign-in until reactivated." : "Lets the organization sign in again."}
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

      <AddAccountForm
        orgId={org.id}
        orgName={org.name}
        onCreated={(email, temp) => {
          if (temp) onIssued(email, temp);
          void onReload();
        }}
      />
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

