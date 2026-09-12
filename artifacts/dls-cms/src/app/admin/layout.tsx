// app/admin/layout.tsx — desktop console shell (Admin + Scheduler) and the
// provider's platform console (Super Admin).
// Menus adapt to the EFFECTIVE role and its feature set; the "view as"
// picker renders only for a real, non-impersonating Admin.
import Image from "next/image";
import { redirect } from "next/navigation";
import { effectiveFeatureKeys, ROLE_LABELS, type FeatureKey } from "@workspace/features";
import { getSessionContext } from "@/lib/auth/session";
import { listUsers } from "@/lib/data/repo-core";
import { AdminSidebar } from "@/components/admin/sidebar";
import { MobileDrawer } from "@/components/admin/mobile-drawer";
import { ImpersonatePicker } from "@/components/admin/impersonate-picker";
import { navForRole } from "@/components/admin/nav-config";
import { DemoBanner } from "@/components/demo-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { IdleTimeout } from "@/components/idle-timeout";
import { SessionProvider } from "@/components/session-context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  if (ctx.effectiveUser.role === "Field_Staff") redirect("/field");
  if (ctx.realUser!.must_change_password && !ctx.impersonating) redirect("/auth/reset?next=/admin");

  const role = ctx.effectiveUser.role;
  const orgKeys = new Set<FeatureKey>(effectiveFeatureKeys(ctx.featureStates, "Admin"));
  const sections = navForRole(role, ctx.features, orgKeys);

  // "View as" picker: REAL Admin only, not while already impersonating, and
  // only while the organization has the capability switched on. The provider
  // starts support sessions from the platform console instead.
  const showPicker =
    ctx.realUser!.role === "Admin" && !ctx.impersonating && ctx.features.has("platform.impersonation");
  const pickerUsers = showPicker
    ? (await listUsers())
        .filter((u) => u.status === "Active" && u.id !== ctx.realUser!.id && (u.role === "Scheduler" || u.role === "Field_Staff"))
        .map((u) => ({ id: u.id, name: u.full_name, role: u.role }))
    : [];

  const orgName = role === "Super_Admin" || role === "Platform_Support" ? "Platform console" : ctx.org?.name ?? "Durable Life Skills";

  return (
    <SessionProvider
      value={{
        features: Array.from(ctx.features),
        role,
        realRole: ctx.realUser!.role,
        impersonating: ctx.impersonating,
        userName: ctx.effectiveUser.full_name,
        orgName: ctx.org?.name ?? null,
        mfa: ctx.mfa,
      }}
    >
      <div className="flex min-h-screen flex-col">
        <DemoBanner />
        {await ImpersonationBanner()}
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
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full border border-border object-contain"
                  />
                  <div className="leading-tight">
                    <div className="font-serif text-sm font-semibold text-plum">Durable Life Skills</div>
                    <div className="label-caps text-muted-foreground">{orgName}</div>
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
    </SessionProvider>
  );
}
