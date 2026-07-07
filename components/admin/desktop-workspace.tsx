// components/admin/desktop-workspace.tsx — README: sections that are
// desktop-only (wide tables) show a "desktop workspace" card on mobile
// instead of a cramped table.
import { Monitor } from "lucide-react";

export function DesktopWorkspace({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="rounded-card border border-border bg-card p-6 text-center md:hidden">
        <Monitor className="mx-auto mb-3 h-8 w-8 text-plum-accent" />
        <h2 className="font-serif text-lg font-semibold text-plum">{title} is a desktop workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This section uses wide tables — open it on a larger screen for the full workspace.
        </p>
      </div>
      <div className="hidden md:block">{children}</div>
    </>
  );
}
