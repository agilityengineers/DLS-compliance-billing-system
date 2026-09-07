// app/field/layout.tsx — mobile-first field shell (the primary surface).
// Guards on the EFFECTIVE role so Admin impersonation shows exactly what the
// field user sees; banners make demo + impersonation state unmistakable.
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { SyncStatus } from "@/components/field/sync-status";
import { SwRegister } from "@/components/field/sw-register";
import { Hydrator } from "@/components/field/hydrator";
import { TabBar } from "@/components/field/tab-bar";
import { DemoBanner } from "@/components/demo-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { IdleTimeout } from "@/components/idle-timeout";

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  if (ctx.effectiveUser.role !== "Field_Staff") redirect("/admin");

  return (
    <div className="field-surface mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <DemoBanner />
      <ImpersonationBanner />
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
        <span className="flex items-center gap-2">
          <Image
            src="/brand/dls-mascot.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-border object-cover"
          />
          <span className="font-serif text-base font-semibold text-plum">DLS Field</span>
        </span>
        <SyncStatus />
      </header>
      <main className="flex-1 p-4 pb-24">{children}</main>
      <TabBar />
      <SwRegister />
      <Hydrator />
      <IdleTimeout />
    </div>
  );
}
