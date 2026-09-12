// components/admin/platform/accounts-panel.tsx — every sign-in on the
// platform in one searchable table, across organizations. This is where the
// provider answers "who is this person, can they get in, and how do I get
// them back in (or out)". Provider accounts are listed separately; they are
// created by the deployment operator, never from a screen.
"use client";

import { useEffect, useMemo, useState } from "react";
import { ROLE_LABELS } from "@workspace/features";
import { platformApi, type AccountRow, type OrgRole, type OrganizationRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { OneTimePassword } from "@/components/admin/one-time-password";
import { AccountRowActions } from "@/components/admin/platform/account-actions";
import { fmtDateTime } from "@/components/admin/platform/format";

type Status = "Active" | "Suspended";

interface Row extends AccountRow {
  orgName: string;
  orgStatus: string;
}

const SELECT = "h-9 rounded-btn border border-border bg-card px-2 text-sm";

export function PlatformAccountsPanel({ selfId, initialOrgId = "" }: { selfId: string; initialOrgId?: string }) {
  const [orgs, setOrgs] = useState<OrganizationRow[] | null>(null);
  const [platformUsers, setPlatformUsers] = useState<AccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [busyRole, setBusyRole] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [orgId, setOrgId] = useState(initialOrgId);
  const [role, setRole] = useState<"" | OrgRole>("");
  const [status, setStatus] = useState<"" | Status>("");
  const [onlyTemp, setOnlyTemp] = useState(false);

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

  const rows = useMemo<Row[]>(
    () => (orgs ?? []).flatMap((o) => o.users.map((u) => ({ ...u, orgName: o.name, orgStatus: o.status }))),
    [orgs]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (orgId && r.orgId !== orgId) return false;
      if (role && r.role !== role) return false;
      if (status && r.status !== status) return false;
      if (onlyTemp && !r.mustChangePassword) return false;
      if (q && !r.fullName.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, orgId, role, status, onlyTemp]);

  if (error && !orgs) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!orgs) return <p className="text-sm text-muted-foreground">Loading accounts…</p>;

  const active = rows.filter((r) => r.status === "Active").length;
  const temp = rows.filter((r) => r.mustChangePassword).length;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {issued && <OneTimePassword email={issued.email} password={issued.password} onDismiss={() => setIssued(null)} />}

      <p className="text-sm text-muted-foreground">
        {rows.length} organization account{rows.length === 1 ? "" : "s"} across {orgs.length} organization{orgs.length === 1 ? "" : "s"}: {active} active
        {temp > 0 && <>, {temp} holding a temporary password</>}. Accounts are created on the Organizations screen (the provider) or in
        Settings (the organization&rsquo;s Admin).
      </p>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search accounts"
          className="h-9 w-64"
        />
        <select className={SELECT} value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-label="Organization">
          <option value="">All organizations</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select className={SELECT} value={role} onChange={(e) => setRole(e.target.value as "" | OrgRole)} aria-label="Role">
          <option value="">All roles</option>
          <option value="Admin">Admin</option>
          <option value="Scheduler">Scheduler</option>
          <option value="Field_Staff">Field Staff</option>
        </select>
        <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as "" | Status)} aria-label="Status">
          <option value="">Active and suspended</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={onlyTemp} onChange={(e) => setOnlyTemp(e.target.checked)} />
          Temporary password only
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} shown</span>
      </div>

      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr><th>Name</th><th>Email</th><th>Organization</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
            {filtered.map((u) => (
              <tr key={u.id} className={u.status === "Suspended" ? "opacity-60" : undefined}>
                <td className="font-medium">{u.fullName}</td>
                <td className="text-plum-accent">{u.email}</td>
                <td>
                  {u.orgName}
                  {u.orgStatus !== "active" && <span className="ml-1.5 text-xs text-destructive">(suspended)</span>}
                </td>
                <td>
                  <select
                    className={SELECT}
                    value={u.role}
                    disabled={busyRole === u.id}
                    aria-label={`Role for ${u.fullName}`}
                    onChange={async (e) => {
                      setBusyRole(u.id);
                      setError(null);
                      try {
                        await platformApi.updateUser(u.id, { role: e.target.value as OrgRole });
                        await load();
                      } catch (err) {
                        setError(errorMessage(err));
                      } finally {
                        setBusyRole(null);
                      }
                    }}
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
                <td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(u.lastLoginAt)}</td>
                <td>
                  <AccountRowActions
                    user={u}
                    selfId={selfId}
                    showSignOut
                    onChanged={load}
                    onIssued={(email, password) => setIssued({ email, password })}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No accounts match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-card border border-border bg-card p-4">
        <h3 className="label-caps text-muted-foreground">Provider accounts</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {platformUsers.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {u.fullName} <span className="text-plum-accent">{u.email}</span>
                {u.id === selfId && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
              </span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[u.role]} · last sign-in {fmtDateTime(u.lastLoginAt)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Provider accounts are created by the deployment operator (the SUPER_ADMIN_* settings), never from this screen, and no
          account can manage another provider account. Change your own password from the sidebar.
        </p>
      </section>
    </div>
  );
}
