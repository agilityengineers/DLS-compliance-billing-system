// components/admin/mobile-drawer.tsx — hamburger drawer mirroring the role's
// desktop menu, with the same collapsible sections (mobile Admin/Scheduler).
"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "./nav-config";

export function MobileDrawer({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ CORE: true });
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="grid h-10 w-10 place-items-center rounded-btn border border-border bg-card"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-plum p-4 text-plum-text">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-serif text-lg font-semibold text-white">Menu</span>
              <button
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-white"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sections.map((s) => (
              <div key={s.key} className="mb-1">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [s.key]: !e[s.key] }))}
                  className="label-caps flex w-full items-center gap-1.5 rounded-md px-2 py-2.5 text-plum-text/90"
                  aria-expanded={expanded[s.key] ?? false}
                >
                  <span className="text-[9px]">{expanded[s.key] ? "▼" : "▶"}</span>
                  {s.label}
                </button>
                {expanded[s.key] && (
                  <div className="space-y-0.5 pb-1">
                    {s.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "block rounded-md px-3 py-2.5 text-sm",
                          (item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href))
                            ? "bg-white/15 font-medium text-white"
                            : "text-plum-text"
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
