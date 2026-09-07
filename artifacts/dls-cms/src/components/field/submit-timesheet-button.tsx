"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitTimesheet } from "@/app/field/actions";

export function SubmitTimesheetButton({ timesheetId }: { timesheetId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="touch"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await submitTimesheet(timesheetId);
            if (!res.ok) setError(res.error ?? "Submit failed");
            else router.refresh();
          })
        }
      >
        {pending ? "Submitting…" : "Submit route record"}
      </Button>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="text-center text-xs text-muted-foreground">
        Submitting marks your notes as in for the payroll transmittal.
      </p>
    </div>
  );
}
