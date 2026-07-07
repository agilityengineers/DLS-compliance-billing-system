// components/admin/sidebar.tsx — desktop admin nav
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, CalendarDays, UserCog, ShieldCheck, Receipt, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/admin/staff", label: "Staff", icon: UserCog },
  { href: "/admin/qa", label: "QA", icon: ShieldCheck },
  { href: "/admin/billing", label: "Billing", icon: Receipt }
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="grid h-7 w-7 place-items-center rounded bg-primary text-xs font-bold text-primary-foreground">DL</div>
        <span className="text-sm font-semibold">DLS-CMS</span>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
