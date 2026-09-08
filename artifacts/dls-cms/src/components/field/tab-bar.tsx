// components/field/tab-bar.tsx — bottom tabs for the daily field workflow:
// Today · Week · Timesheet (when the route record is switched on) · More.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Home, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeature } from "@/components/session-context";

const TABS = [
  { href: "/field", label: "Today", icon: Home, exact: true, feature: null },
  { href: "/field/week", label: "Week", icon: CalendarDays, exact: false, feature: null },
  { href: "/field/timesheet", label: "Timesheet", icon: ClipboardList, exact: false, feature: "timesheets.route_record" },
  { href: "/field/more", label: "More", icon: MoreHorizontal, exact: false, feature: null }
] as const;

export function TabBar() {
  const pathname = usePathname();
  const timesheets = useFeature("timesheets.route_record");
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-border bg-card/95 backdrop-blur"
      aria-label="Primary"
    >
      {TABS.filter((t) => t.feature !== "timesheets.route_record" || timesheets).map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
              active ? "text-plum" : "text-muted-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
