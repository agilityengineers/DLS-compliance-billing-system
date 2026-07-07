// components/admin/impersonate-picker.tsx — the ADMIN-ONLY "view as user"
// control (client priority). Only rendered for a real Admin; every action
// taken while impersonating is audited under the admin's identity.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { startImpersonation } from "@/lib/auth/impersonation";

export function ImpersonatePicker({
  users,
  currentLabel
}: {
  users: { id: string; name: string; role: string }[];
  currentLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-btn border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="label-caps text-muted-foreground">Impersonate</span>
        <span className="rounded-pill bg-plum-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum">
          Admin only
        </span>
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-card border border-border bg-card shadow-lg"
        >
          {users.map((u) => (
            <li key={u.id}>
              <button
                role="option"
                aria-selected={false}
                disabled={pending}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-plum-soft disabled:opacity-50"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  startTransition(async () => {
                    const res = await startImpersonation(u.id);
                    if (!res.ok) setError(res.error ?? "Failed to impersonate");
                    else {
                      router.push("/");
                      router.refresh();
                    }
                  });
                }}
              >
                <span className="font-medium">{u.name}</span>
                <span className="text-xs text-muted-foreground">{u.role.replace(/_/g, " ")}</span>
              </button>
            </li>
          ))}
          <li className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Every action while impersonating is logged under YOUR identity.
          </li>
        </ul>
      )}
      {error && <p className="absolute right-0 mt-1 w-64 text-xs text-destructive">{error}</p>}
    </div>
  );
}
