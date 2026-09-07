// components/field/cancel-visit-panel.tsx — cancellation with a required
// reason (feeds the monthly SLS billing note's cancellation list).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { writeLocal } from "@/lib/offline/db";
import { SyncEngine } from "@/lib/offline/syncEngine";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Visit } from "@/lib/supabase/types";

const REASONS = ["Client cancelled", "Client ill", "Client no-show", "Staff unavailable", "Weather / transport", "Other"];

export function CancelVisitPanel({ visit }: { visit: Visit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    const fullReason = detail.trim() ? `${reason}: ${detail.trim()}` : reason;
    await writeLocal("visits", "update", {
      id: visit.id,
      status: "Cancelled",
      cancellation_reason: fullReason
    });
    void SyncEngine.drain();
    setBusy(false);
    router.push("/field");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-card-m border border-dashed border-border p-3 text-sm text-muted-foreground active:bg-muted"
      >
        Visit didn&rsquo;t happen? Record a cancellation
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-card-m border border-border bg-card p-4">
      <h2 className="label-caps text-muted-foreground">Cancel visit</h2>
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason">Reason</Label>
        <select
          id="cancel-reason"
          className="h-11 w-full rounded-btn border border-border bg-card px-3 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cancel-detail">Details (optional)</Label>
        <Textarea id="cancel-detail" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="touch" onClick={() => setOpen(false)}>Keep visit</Button>
        <Button variant="destructive" size="touch" disabled={busy} onClick={() => void cancel()}>
          {busy ? "Saving…" : "Cancel visit"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cancellations are documented in the monthly billing note.
      </p>
    </section>
  );
}
