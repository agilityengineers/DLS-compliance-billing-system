// app/admin/layout.tsx — desktop console shell (Admin + Scheduler).
// Menus adapt to the EFFECTIVE role (menu_config for non-admins); the
// Impersonate picker renders only for a real, non-impersonating Admin.
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getMenuConfig } from "@/lib/data/repo-business";
import { listUsers } from "@/lib/data/repo-core";
import { AdminSidebar } from "@/components/admin/sidebar";
import { MobileDrawer } from "@/components/admin/mobile-drawer";
import { ImpersonatePicker } from "@/components/admin/impersonate-picker";
import { navForRole } from "@/components/admin/nav-config";
import { DemoBanner } from "@/components/demo-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { IdleTimeout } from "@/components/idle-timeout";
import { ROLE_LABELS } from "@/lib/rbac/roles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  if (ctx.effectiveUser.role === "Field_Staff") redirect("/field");

  const role = ctx.effectiveUser.role;
  const menuRows = await getMenuConfig();
  const enabled =
    role === "Admin"
      ? {}
      : menuRows.find((r) => r.role === role)?.sections ?? {};
  const sections = navForRole(role, enabled as Record<string, boolean>);

  // Impersonate picker: REAL Admin only, and not while already impersonating.
  const showPicker = ctx.realUser!.role === "Admin" && !ctx.impersonating;
  const pickerUsers = showPicker
    ? (await listUsers())
        .filter((u) => u.status === "Active" && u.id !== ctx.realUser!.id)
        .map((u) => ({ id: u.id, name: u.full_name, role: u.role }))
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <ImpersonationBanner />
      <div className="flex flex-1">
        <AdminSidebar
          sections={sections}
          userName={ctx.effectiveUser.full_name}
          userRole={ROLE_LABELS[role]}
          isAdmin={role === "Admin"}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur lg:px-6">
            <div className="flex items-center gap-3">
              <MobileDrawer sections={sections} />
              <div className="flex items-center gap-2.5">
                <Image
                  src="/brand/dls-mascot.png"
                  alt=""
                  width={34}
                  height={34}
                  className="h-[34px] w-[34px] rounded-full border border-border object-cover"
                />
                <div className="leading-tight">
                  <div className="font-serif text-sm font-semibold text-plum">Durable Life Skills</div>
                  <div className="label-caps text-muted-foreground">Care Management</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {showPicker && (
                <ImpersonatePicker
                  users={pickerUsers}
                  currentLabel={`${ctx.realUser!.full_name} — ${ROLE_LABELS[ctx.realUser!.role]}`}
                />
              )}
              {!showPicker && (
                <span className="text-sm text-muted-foreground">
                  {ctx.effectiveUser.full_name} · {ROLE_LABELS[role]}
                </span>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-x-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
      <IdleTimeout />
    </div>
  );
}
