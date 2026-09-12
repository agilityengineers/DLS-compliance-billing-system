// components/admin/requirement-toggles.tsx — the Required / Gating switches.
//
// Gating is meaningless on an item nobody has to hold, so it is disabled while
// Required is off; the server enforces the same pairing.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRequirementToggles } from "@/app/admin/requirements/actions";
import { cn } from "@/lib/utils";

function Switch({
  on, label, disabled, pending, onClick
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || pending}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium transition-opacity",
        (disabled || pending) && "cursor-not-allowed opacity-40"
      )}
    >
      <span className="w-14 text-right text-muted-foreground">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          on ? "bg-pill-success-fg" : "bg-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            on ? "left-[18px]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

export function RequirementToggles({
  requirementId, required, gating
}: {
  requirementId: string;
  required: boolean;
  gating: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState({ required, gating });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: { required: boolean; gating: boolean }) => {
    const previous = state;
    setState(next); // optimistic — the row re-renders from the server on refresh
    setError(null);
    startTransition(async () => {
      const res = await saveRequirementToggles({ requirementId, ...next });
      if (!res.ok) {
        setState(previous);
        setError(res.error ?? "Could not save.");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-4">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Switch
        on={state.gating && state.required}
        label="Gating"
        disabled={!state.required}
        pending={pending}
        onClick={() => save({ required: state.required, gating: !state.gating })}
      />
      <Switch
        on={state.required}
        label="Required"
        pending={pending}
        // Turning Required off also clears Gating; the server does the same.
        onClick={() =>
          save(state.required ? { required: false, gating: false } : { required: true, gating: state.gating })
        }
      />
    </div>
  );
}
