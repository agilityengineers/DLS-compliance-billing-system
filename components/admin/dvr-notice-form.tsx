// components/admin/dvr-notice-form.tsx — "New DVR employment notice" with
// the state form's fields.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDvrNotice } from "@/app/admin/documents/actions";

export function DvrNoticeForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    clientId: clients[0]?.id ?? "",
    noticeType: "new_placement",
    employer: "",
    position: "",
    startDate: new Date().toISOString().slice(0, 10),
    wage: "",
    hoursPerWeek: 20,
    supervisor: "",
    narrative: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <details className="rounded-card border border-border bg-card p-4">
      <summary className="cursor-pointer font-serif text-lg font-semibold text-plum">
        New DVR employment notice
      </summary>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Client</span>
          <select className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Notice type</span>
          <select className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={form.noticeType} onChange={(e) => set("noticeType", e.target.value)}>
            <option value="new_placement">New placement</option>
            <option value="change">Change in employment</option>
            <option value="separation">Separation</option>
          </select>
        </label>
        <div className="space-y-1.5">
          <Label>Start / effective date</Label>
          <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div className="space-y-1.5"><Label>Employer</Label><Input value={form.employer} onChange={(e) => set("employer", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Position</Label><Input value={form.position} onChange={(e) => set("position", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Wage</Label><Input placeholder="$15.50/hr" value={form.wage} onChange={(e) => set("wage", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Hours / week</Label><Input type="number" min={1} value={form.hoursPerWeek} onChange={(e) => set("hoursPerWeek", Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Supervisor</Label><Input value={form.supervisor} onChange={(e) => set("supervisor", e.target.value)} /></div>
        <div className="space-y-1.5 md:col-span-3">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.narrative} onChange={(e) => set("narrative", e.target.value)} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      {ok && <p className="mt-3 rounded-btn bg-pill-success px-3 py-2 text-sm text-pill-success-fg">Notice filed under Documents.</p>}
      <Button
        className="mt-4"
        disabled={pending || !form.employer || !form.position || !form.wage}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setOk(false);
            const res = await createDvrNotice(form);
            if (!res.ok) setError(res.error ?? "Failed");
            else {
              setOk(true);
              router.refresh();
            }
          })
        }
      >
        {pending ? "Filing…" : "File notice"}
      </Button>
    </details>
  );
}
