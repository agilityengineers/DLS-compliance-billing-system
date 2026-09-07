// components/admin/payroll-certify.tsx — certification + submit.
// Blocked while any employee's notes are outstanding (README requirement).
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { certifyAndSubmitPayroll } from "@/app/admin/payroll/actions";

export function PayrollCertify({ periodId, outstanding }: { periodId: string; outstanding: number }) {
  const router = useRouter();
  const [certified, setCertified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = outstanding > 0;

  return (
    <div className="space-y-3 rounded-card border border-border bg-card p-4">
      {blocked && (
        <p className="rounded-btn bg-pill-danger px-3 py-2 text-sm text-pill-danger-fg">
          Submission blocked — {outstanding} employee{outstanding > 1 ? "s have" : " has"} notes
          outstanding. Route records must be submitted first.
        </p>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#5F7161]"
          checked={certified}
          disabled={blocked}
          onChange={(e) => setCertified(e.target.checked)}
        />
        <span>
          I certify that the hours above flow from EVV-verified timesheets and are accurate and
          complete for this pay period.
        </span>
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button
        disabled={blocked || !certified || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await certifyAndSubmitPayroll(periodId);
            if (!res.ok) setError(res.error ?? "Submission failed.");
            else router.refresh();
          })
        }
      >
        {pending ? "Submitting…" : "Submit transmittal"}
      </Button>
    </div>
  );
}
