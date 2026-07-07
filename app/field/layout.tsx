// app/field/layout.tsx — mobile-first field shell; registers the service worker
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SyncStatus } from "@/components/field/sync-status";
import { SwRegister } from "@/components/field/sw-register";

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="field-surface mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <span className="text-sm font-semibold">DLS Field</span>
        <SyncStatus />
      </header>
      <main className="flex-1 p-4 pb-24">{children}</main>
      <SwRegister />
    </div>
  );
}
