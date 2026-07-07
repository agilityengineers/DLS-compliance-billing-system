// components/admin/sidebar.tsx — the Duet plum sidebar.
// Collapsible to a 64px icon rail («/» toggle); sections individually
// collapsible (▼/▶) with CORE expanded by default; user card pinned bottom.
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle, Banknote, BarChart3, CalendarDays, ChevronsLeft, ChevronsRight,
  FolderOpen, GraduationCap, LayoutDashboard, Lock, MapPin, Pill, Receipt,
  ScrollText, Settings, ShieldCheck, UserCog, Users, type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "./nav-config";

const ICONS: Record<string, LucideIcon> = {
  AlertTriangle, LayoutDashboard, Users, CalendarDays, UserCog, ShieldCheck, MapPin, Pill,
  ScrollText, Receipt, Banknote, BarChart3, FolderOpen, GraduationCap, Settings
};

export function AdminSidebar({
  sections,
  userName,
  userRole,
  isAdmin
}: {
  sections: NavSection[];
  userName: string;
  userRole: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ CORE: true });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dls_sidebar");
      if (saved) {
        const s = JSON.parse(saved) as { collapsed?: boolean; open?: Record<string, boolean> };
        if (typeof s.collapsed === "boolean") setCollapsed(s.collapsed);
        if (s.open) setOpen(s.open);
      }
    } catch { /* first visit */ }
  }, []);

  function persist(nextCollapsed: boolean, nextOpen: Record<string, boolean>) {
    try {
      localStorage.setItem("dls_sidebar", JSON.stringify({ collapsed: nextCollapsed, open: nextOpen }));
    } catch { /* private mode */ }
  }

  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col bg-plum text-plum-text transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* rail toggle */}
      <div className={cn("flex items-center p-3", collapsed ? "justify-center" : "justify-end")}>
        <button
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            persist(next, open);
          }}
          className="grid h-8 w-8 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {sections.map((section) => {
          const expanded = open[section.key] ?? false;
          return (
            <div key={section.key} className="mb-1">
              {!collapsed && (
                <button
                  onClick={() => {
                    const nextOpen = { ...open, [section.key]: !expanded };
                    setOpen(nextOpen);
                    persist(collapsed, nextOpen);
                  }}
                  className="label-caps flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-plum-text/90 hover:text-white"
                  aria-expanded={expanded}
                >
                  <span className="text-[9px]">{expanded ? "▼" : "▶"}</span>
                  {section.label}
                </button>
              )}
              {(expanded || collapsed) && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = ICONS[item.icon] ?? LayoutDashboard;
                    const active = isActive(item.href);
                    const locked = item.lockedForNonAdmin && !isAdmin;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                          collapsed && "justify-center px-0",
                          active ? "bg-white/15 font-medium text-white" : "text-plum-text hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="flex-1">{item.label}</span>}
                        {!collapsed && locked && <Lock className="h-3.5 w-3.5 opacity-70" aria-label="Admin-only" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* user card pinned at bottom */}
      <div className={cn("border-t border-white/10 p-3", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <Image
            src="/brand/dls-mascot.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full border border-white/20 object-cover"
          />
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{userName}</div>
              <div className="flex items-center gap-2 text-xs text-plum-text">
                {userRole}
                <Link href="/logout" className="underline hover:text-white">Sign out</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
