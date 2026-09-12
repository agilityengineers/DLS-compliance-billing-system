// components/admin/platform/page-header.tsx — the standard heading for every
// provider screen: a "Platform console" eyebrow so the reader always knows
// they are in the provider's area, the title, and one paragraph of intent.
import type { ReactNode } from "react";

export function PlatformPageHeader({ title, intro, actions }: { title: string; intro: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="label-caps text-muted-foreground">Platform console</div>
        <h1 className="page-title">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{intro}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
