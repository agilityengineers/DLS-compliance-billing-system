// components/admin/manual-adjustment-form.tsx — Admin-only manual EVV entry.
// The reason field is REQUIRED here, by the server action, and by the DB
// CHECK constraint — an empty reason cannot reach the table.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { manualEvvAdjustment } from "@/lib/evv/manualAdjustment";

export function ManualAdjustmentForm({ visits }: { visits: { id: string; label: string }[] }) {
  const router = useRouter();
  const [visitId, setVisitId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [inTime, setInTime] = useState("09:00");
  const [outTime, setOutTime] = useState("11:00");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <details className="rounded-card border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Manual adjustment (Admin only — reason required)</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 text-sm md:col-span-2">
          <span className="label-caps text-muted-foreground">Visit</span>
          <select
            className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={visitId}
            onChange={(e) => setVisitId(e.target.value)}
          >
            <option value="">Select a visit…</option>
            {visits.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Clock in</Label><Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Clock out</Label><Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Reason (required — recorded on the log and in the audit trail)</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Device battery died at clock-out; visit verified with caregiver by phone" />
        </div>
      </div>
      {error && <p className="mt-3 rounded-btn bg-pill-danger px-3 py-2 text-sm text-pill-danger-fg" role="alert">{error}</p>}
      {result && <p className="mt-3 rounded-btn bg-pill-success px-3 py-2 text-sm text-pill-success-fg">{result}</p>}
      <Button
        className="mt-4"
        disabled={pending || !visitId || !reason.trim()}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setResult(null);
            const res = await manualEvvAdjustment({
              visitId,
              clockInTime: `${date}T${inTime}:00`,
              clockOutTime: `${date}T${outTime}:00`,
              reason: reason.trim()
            });
            if (!res.ok) setError(res.error ?? "Rejected");
            else {
              setResult("Manual EVV record created (audited).");
              setReason("");
              router.refresh();
            }
          })
        }
      >
        {pending ? "Saving…" : "Record manual EVV"}
      </Button>
    </details>
  );
}
