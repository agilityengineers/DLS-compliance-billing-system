// components/admin/staff-row-actions.tsx — Record renewal + offboarding.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renewLicense, renewTraining, offboardStaff } from "@/app/admin/staff/actions";

export function StaffRowActions({
  user,
  expiredCourses,
  licenseExpired,
  reassignTargets
}: {
  user: { id: string; name: string; status: string; role: string };
  expiredCourses: string[];
  licenseExpired: boolean;
  reassignTargets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "renew" | "offboard">("none");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // renewal form state
  const [course, setCourse] = useState(expiredCourses[0] ?? "");
  const [licenseDate, setLicenseDate] = useState("");
  const [completedOn, setCompletedOn] = useState(new Date().toISOString().slice(0, 10));
  const [expiresOn, setExpiresOn] = useState("");
  const [reassignTo, setReassignTo] = useState(reassignTargets[0]?.id ?? "");

  if (mode === "none") {
    return (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setMode("renew")}>Record renewal</Button>
        {user.status === "Active" && user.role === "Field_Staff" && (
          <Button size="sm" variant="ghost" onClick={() => setMode("offboard")}>Offboard</Button>
        )}
      </div>
    );
  }

  if (mode === "renew") {
    return (
      <div className="space-y-2 rounded-btn border border-border bg-muted/40 p-3 text-left">
        <p className="text-xs font-medium">Record renewal for {user.name}</p>
        {licenseExpired && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">New license expiration</Label>
              <Input type="date" className="h-9" value={licenseDate} onChange={(e) => setLicenseDate(e.target.value)} />
            </div>
            <Button
              size="sm"
              disabled={pending || !licenseDate}
              onClick={() =>
                startTransition(async () => {
                  const res = await renewLicense(user.id, licenseDate);
                  if (!res.ok) setError(res.error ?? "Failed");
                  else {
                    setMode("none");
                    router.refresh();
                  }
                })
              }
            >
              Save
            </Button>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Training course</Label>
          <Input className="h-9" placeholder="e.g. QMAP Medication Administration" value={course} onChange={(e) => setCourse(e.target.value)} />
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Completed</Label>
              <Input type="date" className="h-9" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Expires (blank = none)</Label>
              <Input type="date" className="h-9" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            <Button
              size="sm"
              disabled={pending || !course}
              onClick={() =>
                startTransition(async () => {
                  const res = await renewTraining(user.id, course, completedOn, expiresOn || null);
                  if (!res.ok) setError(res.error ?? "Failed");
                  else {
                    setMode("none");
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Saving…" : "Save renewal"}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-btn border border-border bg-muted/40 p-3 text-left">
      <p className="text-xs font-medium">Offboard {user.name}</p>
      <p className="text-xs text-muted-foreground">
        Suspends the account and reassigns upcoming visits + open documentation in one step.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Reassign caseload to</Label>
        <select
          className="h-9 w-full rounded-btn border border-border bg-card px-2 text-sm"
          value={reassignTo}
          onChange={(e) => setReassignTo(e.target.value)}
        >
          {reassignTargets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || !reassignTo}
          onClick={() =>
            startTransition(async () => {
              const res = await offboardStaff(user.id, reassignTo);
              if (!res.ok) setError(res.error ?? "Failed");
              else {
                setMode("none");
                router.refresh();
              }
            })
          }
        >
          {pending ? "Working…" : "Suspend & reassign"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
