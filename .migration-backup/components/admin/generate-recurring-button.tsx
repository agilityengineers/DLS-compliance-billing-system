"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateRecurringVisits } from "@/app/admin/schedule/actions";

export function GenerateRecurringButton({ weekMonday }: { weekMonday: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await generateRecurringVisits(weekMonday);
            setMsg(
              res.created > 0
                ? `${res.created} recurring visit${res.created > 1 ? "s" : ""} generated`
                : res.errors.length > 0
                  ? `Skipped: ${res.errors[0]}`
                  : "Recurring visits already generated"
            );
            router.refresh();
          })
        }
      >
        {pending ? "Generating…" : "Generate recurring visits"}
      </Button>
    </div>
  );
}
