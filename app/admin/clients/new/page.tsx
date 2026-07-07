// app/admin/clients/new/page.tsx — intake form with live age + diagnosis count
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createClientRecord } from "../actions";

interface Dx { code: string; description: string }

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "", last_name: "", medicaid_id: "", date_of_birth: "",
    insurance_provider: "", service_plan_start: "", service_plan_end: "",
    authorized_scc_hours_per_week: 0, authorized_nmt_trips_per_week: 0
  });
  const [diagnoses, setDiagnoses] = useState<Dx[]>([]);
  const [dx, setDx] = useState<Dx>({ code: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const age = useMemo(() => {
    if (!form.date_of_birth) return null;
    const dob = new Date(form.date_of_birth);
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - dob.getFullYear();
    if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) a -= 1;
    return a >= 0 ? a : null;
  }, [form.date_of_birth]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const res = await createClientRecord({ ...form, active_diagnoses: diagnoses });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "Failed to save."); return; }
    router.push("/admin/clients");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">New client intake</h1>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>First name</Label><Input required value={form.first_name} onChange={set("first_name")} /></div>
          <div className="space-y-1.5"><Label>Last name</Label><Input required value={form.last_name} onChange={set("last_name")} /></div>
          <div className="space-y-1.5"><Label>Medicaid ID</Label><Input required value={form.medicaid_id} onChange={set("medicaid_id")} /></div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input type="date" required value={form.date_of_birth} onChange={set("date_of_birth")} />
            {age !== null && <p className="text-xs text-muted-foreground">Calculated age: <strong>{age}</strong></p>}
          </div>
          <div className="space-y-1.5"><Label>Insurance provider</Label><Input value={form.insurance_provider} onChange={set("insurance_provider")} /></div>
          <div />
          <div className="space-y-1.5"><Label>Service plan start</Label><Input type="date" value={form.service_plan_start} onChange={set("service_plan_start")} /></div>
          <div className="space-y-1.5"><Label>Service plan end</Label><Input type="date" value={form.service_plan_end} onChange={set("service_plan_end")} /></div>
          <div className="space-y-1.5"><Label>Authorized SCC hrs/week</Label><Input type="number" min={0} step={0.25} value={form.authorized_scc_hours_per_week} onChange={set("authorized_scc_hours_per_week")} /></div>
          <div className="space-y-1.5"><Label>Authorized NMT trips/week</Label><Input type="number" min={0} value={form.authorized_nmt_trips_per_week} onChange={set("authorized_nmt_trips_per_week")} /></div>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium">
            Active diagnoses <Badge variant="muted">{diagnoses.length}</Badge>
          </legend>
          <div className="flex gap-2">
            <Input placeholder="ICD-10 code" className="w-36" value={dx.code} onChange={(e) => setDx({ ...dx, code: e.target.value })} />
            <Input placeholder="Description" value={dx.description} onChange={(e) => setDx({ ...dx, description: e.target.value })} />
            <Button type="button" variant="outline" onClick={() => {
              if (!dx.code) return;
              setDiagnoses((d) => [...d, dx]); setDx({ code: "", description: "" });
            }}>Add</Button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {diagnoses.map((d, i) => (
              <li key={i}>
                <button type="button" className="rounded-full bg-muted px-3 py-1 text-xs hover:bg-destructive/10"
                  onClick={() => setDiagnoses((arr) => arr.filter((_, j) => j !== i))}
                  title="Remove">
                  {d.code} — {d.description} ✕
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create client"}</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
