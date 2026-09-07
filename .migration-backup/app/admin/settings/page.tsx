// app/admin/settings/page.tsx — Settings & users (ADMIN-ONLY):
// user CRUD · menu configuration per role · RLS permission matrix.
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listUsers } from "@/lib/data/repo-core";
import { getMenuConfig } from "@/lib/data/repo-business";
import { PERMISSION_MATRIX, ROLE_LABELS } from "@/lib/rbac/roles";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { UserAdminPanel, AddUserForm } from "@/components/admin/user-admin-panel";
import { MenuConfigPanel } from "@/components/admin/menu-config-panel";
import { Check, Minus } from "lucide-react";

export default async function SettingsPage() {
  let ctx;
  try {
    ctx = await requireRole("Admin");
  } catch {
    redirect("/admin");
  }

  const [users, menuConfig] = await Promise.all([listUsers(), getMenuConfig()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Settings &amp; users</h1>
        <p className="text-sm text-muted-foreground">
          Accounts, roles, and the permission matrix enforced by row-level security.
        </p>
      </div>

      {/* ── Users ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-plum">Users</h2>
        <Table>
          <THead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th className="text-right">Actions</th></tr>
          </THead>
          <TBody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.full_name}</td>
                <td className="text-plum-accent">{u.email}</td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td><Badge variant={u.status === "Active" ? "success" : "muted"}>{u.status}</Badge></td>
                <td className="text-right">
                  <UserAdminPanel
                    user={{ id: u.id, name: u.full_name, role: u.role, status: u.status }}
                    isSelf={u.id === ctx.realUser!.id}
                  />
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
        <AddUserForm />
      </section>

      {/* ── Menu configuration (per role) ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-plum">Menu configuration (per role)</h2>
        <p className="text-sm text-muted-foreground">
          Choose which sections Schedulers and Field Staff see. Billing, Payroll, Staff &amp;
          credentials, and Settings are always Admin-only regardless of these switches
          (the Scheduler&rsquo;s Billing entry opens a locked explanation).
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {menuConfig.map((row) => (
            <MenuConfigPanel key={row.role} role={row.role} sections={row.sections} />
          ))}
        </div>
      </section>

      {/* ── Permission matrix ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-plum">Permission matrix</h2>
        <p className="text-sm text-muted-foreground">
          UI mirror of the row-level-security policies (supabase/policies/*.sql) — the database
          is the enforcement point.
        </p>
        <Table>
          <THead>
            <tr><th>Capability</th><th className="text-center">Admin</th><th className="text-center">Scheduler</th><th className="text-center">Field Staff</th></tr>
          </THead>
          <TBody>
            {PERMISSION_MATRIX.map((row) => (
              <tr key={row.capability}>
                <td>{row.capability}</td>
                {(["Admin", "Scheduler", "Field_Staff"] as const).map((r) => (
                  <td key={r} className="text-center">
                    {row[r] ? (
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
    </div>
  );
}
