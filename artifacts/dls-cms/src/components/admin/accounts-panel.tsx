// components/admin/accounts-panel.tsx — the organization's real accounts
// (Settings → Accounts): add people, change their role, suspend, and issue a
// one-time password. Talks to the API directly; the API enforces the
// hierarchy (an Admin manages Admins, Schedulers and Field Staff in their own
// organization, never the provider).
"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS } from "@workspace/features";
import { orgApi, type AccountRow, type OrgRole } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { invalidateDirectory } from "@/lib/auth/directory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OneTimePassword } from "@/components/admin/one-time-password";

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";
}

export function AccountsPanel({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  async function load() {
    try {
      setUsers((await orgApi.users()).users);
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
      invalidateDirectory(); // staff lists on other screens include these accounts
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !users) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!users) return <p className="text-sm text-muted-foreground">Loading accounts…</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {issued && <OneTimePassword email={issued.email} password={issued.password} onDismiss={() => setIssued(null)} />}
      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
            {users.map((u) => {
              const isSelf = u.id === selfId;
              return (
                <tr key={u.id} className={u.status === "Suspended" ? "opacity-60" : undefined}>
                  <td className="font-medium">{u.fullName}{isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}</td>
                  <td className="text-plum-accent">{u.email}</td>
                  <td>
                    <select
                      className="h-9 rounded-btn border border-border bg-card px-2 text-sm"
                      value={u.role}
                      disabled={isSelf || busy === `role:${u.id}`}
                      aria-label={`Role for ${u.fullName}`}
                      onChange={(e) => void run(`role:${u.id}`, () => orgApi.updateUser(u.id, { role: e.target.value as OrgRole }).then(() => undefined))}
                    >
                      <option value="Admin">Admin</option>
                      <option value="Scheduler">Scheduler</option>
                      <option value="Field_Staff">Field Staff</option>
                    </select>
                  </td>
                  <td>
                    <Badge variant={u.status === "Active" ? "success" : "muted"}>{u.status}</Badge>
                    {u.mustChangePassword && <span className="ml-2 text-xs text-muted-foreground">temp password</span>}
                  </td>
                  <td className="text-muted-foreground">{fmt(u.lastLoginAt)}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `reset:${u.id}`}
                        onClick={() =>
                          void run(`reset:${u.id}`, async () => {
                            const r = await orgApi.resetPassword(u.id);
                            if (r.temporaryPassword) setIssued({ email: u.email, password: r.temporaryPassword });
                          })
                        }
                      >
                        Reset password
                      </Button>
                      {!isSelf && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === `status:${u.id}`}
                          onClick={() => void run(`status:${u.id}`, () => orgApi.updateUser(u.id, { status: u.status === "Active" ? "Suspended" : "Active" }).then(() => undefined))}
                        >
                          {u.status === "Active" ? "Suspend" : "Activate"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground">No accounts yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <AddAccountForm
        onCreated={(email, temp) => {
          // No page refresh here: it would unmount the one-time password before anyone could read it.
          if (temp) setIssued({ email, password: temp });
          void load();
          invalidateDirectory();
        }}
      />
    </div>
  );
}

function AddAccountForm({ onCreated }: { onCreated: (email: string, temporaryPassword: string | null) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("Field_Staff");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <details className="rounded-card border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Add account</summary>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          setOk(null);
          try {
            const r = await orgApi.createUser({ email, fullName, role, password: password || undefined });
            setOk(`${r.user.fullName} added as ${ROLE_LABELS[r.user.role]}.`);
            onCreated(r.user.email, r.temporaryPassword);
            setFullName("");
            setEmail("");
            setPassword("");
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="acct-name">Full name</Label>
            <Input id="acct-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-email">Email</Label>
            <Input id="acct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-role">Role</Label>
            <select id="acct-role" className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              <option value="Field_Staff">Field Staff</option>
              <option value="Scheduler">Scheduler</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-pw">Password (optional)</Label>
            <Input id="acct-pw" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to generate" />
          </div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {ok && <p className="text-sm text-pill-success-fg" role="status">{ok}</p>}
        <Button type="submit" disabled={pending || !fullName || !email}>{pending ? "Adding…" : "Add account"}</Button>
        <p className="text-xs text-muted-foreground">
          The person signs in with their email and the password you set, or with the one-time password shown after you add them;
          they choose their own password on first sign-in.
        </p>
      </form>
    </details>
  );
}
