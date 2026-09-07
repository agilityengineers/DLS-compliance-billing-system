"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runReliasSyncNow } from "@/app/admin/relias/actions";

export function ReliasSyncButton() {
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
            const res = await runReliasSyncNow();
            setMsg(res.ok ? `Imported ${res.imported}, skipped ${res.skipped}` : res.error ?? "Sync failed");
            router.refresh();
          })
        }
      >
        {pending ? "Syncing…" : "Run completion sync"}
      </Button>
    </div>
  );
}
