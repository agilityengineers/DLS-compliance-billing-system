// components/admin/clients/diagnosis-entry.tsx — the "add a diagnosis" row
// shared by the new-client intake and the client record form.
//
// It is a plain row of inputs, not a nested <form>, because it sits inside
// the page's own form. So pressing Enter in either box would normally submit
// the whole page. Here, Enter adds the diagnosis instead, and a missing code
// or a duplicate shows a message rather than doing nothing.
//
// The parent form calls takePending() on save, so a diagnosis that was typed
// but never added is not lost: it is added, or the save stops with a message.
"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
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

/** What is left in the entry boxes when the page is saved. */
export type PendingDiagnosis =
  | { status: "empty" }
  | { status: "ok"; value: DiagnosisDraft }
  | { status: "invalid"; error: string };

export interface DiagnosisEntryHandle {
  /**
   * Hand over whatever is still typed in the boxes. A valid entry is returned
   * and the boxes are cleared; an invalid one stays put with its message shown.
   */
  takePending: () => PendingDiagnosis;
}

/** Sort out what is still typed in the boxes when the page is saved. */
export function pendingDiagnosis(draft: DiagnosisDraft, existing: readonly { code: string }[]): PendingDiagnosis {
  if (!draft.code.trim() && !draft.description.trim()) return { status: "empty" };
  const res = validateDiagnosis(draft, existing);
  return res.ok ? { status: "ok", value: res.value } : { status: "invalid", error: res.error };
}

export const DiagnosisEntry = forwardRef<
  DiagnosisEntryHandle,
  { existing: readonly { code: string }[]; onAdd: (dx: DiagnosisDraft) => void }
>(function DiagnosisEntry({ existing, onAdd }, ref) {
  const [draft, setDraft] = useState<DiagnosisDraft>({ code: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    takePending() {
      const res = pendingDiagnosis(draft, existing);
      if (res.status === "ok") {
        setDraft({ code: "", description: "" });
        setError(null);
      } else if (res.status === "invalid") {
        setError(res.error);
        codeRef.current?.focus();
      }
      return res;
    },
  }), [draft, existing]);

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
});
