// components/auth/demo-role-picker.tsx — DEMO-ONLY sign-in.
// Lets the client tour every role with zero auth setup. Disabled outside
// demo mode by the server action (PRODUCTION-READINESS.md §4.1).
"use client";

import { useState, useTransition } from "react";
import { demoSignIn } from "@/lib/auth/actions";

const DEMO_USERS: { id: string; name: string; role: string; blurb: string }[] = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    name: "K. Sandoval",
    role: "Admin",
    blurb: "Full console: billing, payroll, settings, impersonation"
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    name: "T. Alvarez",
    role: "Scheduler",
    blurb: "Scheduling & compliance; Billing visible but locked"
  },
  {
    id: "00000000-0000-4000-a000-000000000003",
    name: "Maria Vega",
    role: "Field Staff",
    blurb: "Mobile-first: today's visits, clock-in, notes, eMAR"
  }
];

export function DemoRolePicker() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2.5">
      <p className="label-caps text-muted-foreground">Demo sign-in — pick a role</p>
      {DEMO_USERS.map((u) => (
        <button
          key={u.id}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await demoSignIn(u.id);
              if (res && !res.ok) setError(res.error ?? "Sign-in failed");
            })
          }
          className="flex w-full items-center justify-between gap-3 rounded-card border border-border bg-card p-3.5 text-left transition-colors hover:border-plum-accent hover:bg-plum-soft disabled:opacity-50"
        >
          <span>
            <span className="block font-medium text-foreground">{u.name}</span>
            <span className="block text-xs text-muted-foreground">{u.blurb}</span>
          </span>
          <span className="rounded-pill bg-plum-soft px-2.5 py-0.5 text-xs font-medium text-plum">{u.role}</span>
        </button>
      ))}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
