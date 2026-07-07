// components/admin/menu-config-panel.tsx — per-role section checkboxes.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { saveMenuConfig } from "@/app/admin/settings/actions";

const SECTION_LABELS: Record<string, string> = {
  CORE: "Core (Dashboard, Clients, Schedule)",
  COMPLIANCE: "Compliance (QA, EVV review, eMAR)",
  BUSINESS: "Business (Billing*, Reports, Documents)",
  TRAINING: "Training & Learning (Relias)",
  SYSTEM: "System (Settings) — Admin-only, always off"
};

export function MenuConfigPanel({
  role,
  sections
}: {
  role: "Scheduler" | "Field_Staff";
  sections: Record<string, boolean>;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>({ ...sections });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-3 rounded-card border border-border bg-card p-4">
      <h3 className="font-medium">{role.replace(/_/g, " ")}</h3>
      <div className="space-y-2">
        {Object.keys(SECTION_LABELS).map((key) => (
          <label key={key} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#5F7161]"
              checked={key === "SYSTEM" ? false : state[key] ?? false}
              disabled={key === "SYSTEM"}
              onChange={(e) => {
                setState((s) => ({ ...s, [key]: e.target.checked }));
                setSaved(false);
              }}
            />
            <span className={key === "SYSTEM" ? "text-muted-foreground" : undefined}>{SECTION_LABELS[key]}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveMenuConfig({ role, sections: state });
              if (res.ok) {
                setSaved(true);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-xs text-pill-success-fg">Saved.</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        *Billing stays locked for non-admins even when Business is visible.
      </p>
    </div>
  );
}
