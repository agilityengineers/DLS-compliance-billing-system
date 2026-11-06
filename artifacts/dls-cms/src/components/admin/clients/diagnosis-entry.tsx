// components/admin/clients/diagnosis-entry.tsx — the "add a diagnosis" row
// shared by the new-client intake and the client record form.
//
// It is a plain row of inputs, not a nested <form>, because it sits inside
// the page's own form. So pressing Enter in either box would normally submit
// the whole page. Here, Enter adds the diagnosis instead, and a missing code
// or a duplicate shows a message rather than doing nothing.
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface DiagnosisDraft {
  code: string;
  description: string;
}

/** Trim and upper-case an ICD-10 code ("f84.0 " → "F84.0"). */
export function normalizeIcd10(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Check a draft against the list it is about to join. Returns the cleaned
 * diagnosis, or an error message for the person typing.
 */
export function validateDiagnosis(
  draft: DiagnosisDraft,
  existing: readonly { code: string }[]
): { ok: true; value: DiagnosisDraft } | { ok: false; error: string } {
  const code = normalizeIcd10(draft.code);
  const description = draft.description.trim();
  if (!code) {
    return { ok: false, error: description ? "Enter the ICD-10 code for this diagnosis." : "Enter an ICD-10 code to add a diagnosis." };
  }
  if (existing.some((d) => normalizeIcd10(d.code) === code)) {
    return { ok: false, error: `${code} is already on the list.` };
  }
  return { ok: true, value: { code, description } };
}

export function DiagnosisEntry({
  existing,
  onAdd,
}: {
  existing: readonly { code: string }[];
  onAdd: (dx: DiagnosisDraft) => void;
}) {
  const [draft, setDraft] = useState<DiagnosisDraft>({ code: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  function add() {
    const res = validateDiagnosis(draft, existing);
    if (!res.ok) {
      setError(res.error);
      codeRef.current?.focus();
      return;
    }
    onAdd(res.value);
    setDraft({ code: "", description: "" });
    setError(null);
    // Back to the code box, ready for the next one.
    codeRef.current?.focus();
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const update = (key: keyof DiagnosisDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    if (error) setError(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <Input
          ref={codeRef}
          aria-label="ICD-10 code"
          aria-invalid={error ? true : undefined}
          placeholder="ICD-10 code"
          className="w-36"
          value={draft.code}
          onChange={update("code")}
          onKeyDown={onKeyDown}
        />
        <Input
          aria-label="Diagnosis description"
          placeholder="Description"
          className="min-w-48 flex-1"
          value={draft.description}
          onChange={update("description")}
          onKeyDown={onKeyDown}
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Add as many as apply. Press Enter or Add after each one.</p>
      )}
    </div>
  );
}
