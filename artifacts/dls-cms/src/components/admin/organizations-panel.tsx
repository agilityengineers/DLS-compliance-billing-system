// components/admin/organizations-panel.tsx — the provider's view of every
// organization and the accounts inside it: create the organization's Admin
// (e.g. Lisa Torres), reset a password, suspend, or start an audited
// "view as" support session. No client records are loaded here.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@workspace/features";
import { platformApi, type AccountRow, type OrganizationRow, type OrgRole } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { startImpersonation } from "@/lib/auth/impersonation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OneTimePassword } from "@/components/admin/one-time-password";

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";
}

export function OrganizationsPanel({ selfId }: { selfId: string }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrganizationRow[] | null>(null);
  const [platformUsers, setPlatformUsers] = useState<AccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await platformApi.organizations();
      setOrgs(r.organizations);
      setPlatformUsers(r.platformUsers);
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
        <section key={org.id} className="overflow-hidden rounded-card border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-plum">{org.name}</h3>
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1">{org.slug}</code> · {org.users.length} account{org.users.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={org.status === "active" ? "success" : "destructive"}>{org.status}</Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === `org:${org.id}`}
                onClick={() =>
                  void run(`org:${org.id}`, async () => {
                    await platformApi.updateOrganization(org.id, { status: org.status === "active" ? "suspended" : "active" });
                  })
                }
              >
                {org.status === "active" ? "Suspend organization" : "Reactivate"}
              </Button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody className="[&_td]:px-4 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
              {org.users.map((u) => (
                <tr key={u.id} className={u.status === "Suspended" ? "opacity-60" : undefined}>
                  <td className="font-medium">{u.fullName}</td>
                  <td className="text-plum-accent">{u.email}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>
                    <Badge variant={u.status === "Active" ? "success" : "muted"}>{u.status}</Badge>
                    {u.mustChangePassword && <span className="ml-2 text-xs text-muted-foreground">temp password</span>}
                  </td>
                  <td className="text-muted-foreground">{fmt(u.lastLoginAt)}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {u.status === "Active" && (
                        <Button
                          size="sm"
                          variant="plum"
                          disabled={busy === `view:${u.id}`}
                          title="Open the app exactly as this person sees it. Every action is logged under your identity."
                          onClick={() =>
                            void run(`view:${u.id}`, async () => {
                              const res = await startImpersonation(u.id);
                              if (!res.ok) throw new Error(res.error ?? "Could not start the support session.");
                              router.push("/");
                              router.refresh();
                            })
                          }
                        >
                          View as
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `reset:${u.id}`}
                        onClick={() =>
                          void run(`reset:${u.id}`, async () => {
                            const r = await platformApi.resetPassword(u.id);
                            if (r.temporaryPassword) setIssued({ email: u.email, password: r.temporaryPassword });
                          })
                        }
                      >
                        Reset password
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === `status:${u.id}` || u.id === selfId}
                        onClick={() =>
                          void run(`status:${u.id}`, async () => {
                            await platformApi.updateUser(u.id, { status: u.status === "Active" ? "Suspended" : "Active" });
                          })
                        }
                      >
                        {u.status === "Active" ? "Suspend" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {org.users.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground">No accounts yet — add the organization's administrator below.</td></tr>
              )}
            </tbody>
          </table>

          <AddAccountForm
            orgId={org.id}
            orgName={org.name}
            onCreated={(email, temp) => {
              if (temp) setIssued({ email, password: temp });
              void load();
            }}
          />
        </section>
      ))}

      <NewOrganizationForm onCreated={() => void load()} />

      <section className="rounded-card border border-border bg-card p-4">
        <h3 className="label-caps text-muted-foreground">Platform accounts</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {platformUsers.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3">
              <span>{u.fullName} <span className="text-plum-accent">{u.email}</span></span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[u.role]} · last sign-in {fmt(u.lastLoginAt)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Additional provider accounts are created by the deployment operator (SUPER_ADMIN_* settings), never from this screen.
        </p>
      </section>
    </div>
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
    <form onSubmit={submit} className="space-y-3 border-t border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Add an account to {orgName}</p>
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
    </form>
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
      <p className="mt-2 text-xs text-muted-foreground">Each organization has its own administrators, employees and feature settings.</p>
    </details>
  );
}
