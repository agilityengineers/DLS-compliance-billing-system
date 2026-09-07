"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveQaFlag } from "@/app/admin/qa/actions";

export function ResolveFlagButton({ flagKey }: { flagKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Resolve</Button>;
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        className="h-9 w-56"
        placeholder="Resolution note (required)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        size="sm"
        disabled={pending || !note.trim()}
        onClick={() =>
          startTransition(async () => {
            const res = await resolveQaFlag(flagKey, note.trim());
            if (!res.ok) setError(res.error ?? "Failed");
            else router.refresh();
          })
        }
      >
        {pending ? "…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>✕</Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
