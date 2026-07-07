"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitIncident } from "@/app/field/incident/actions";

const TYPES = [
  { value: "abuse_neglect", label: "Suspected abuse / neglect" },
  { value: "critical", label: "Critical incident" },
  { value: "medication_error", label: "Medication error" },
  { value: "injury", label: "Injury" },
  { value: "other", label: "Other" }
] as const;

export function IncidentForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("critical");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4 rounded-card-m border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!description.trim()) {
          setError("A description is required.");
          return;
        }
        startTransition(async () => {
          const res = await submitIncident({
            clientId: clientId || null,
            incidentType: type,
            description: description.trim(),
            immediateAction: action.trim() || null
          });
          if (!res.ok) setError(res.error ?? "Failed to submit");
          else router.push("/field/more");
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="inc-client">Client (if applicable)</Label>
        <select
          id="inc-client"
          className="h-11 w-full rounded-btn border border-border bg-card px-3 text-sm"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">— Not client-specific —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inc-type">Incident type</Label>
        <select
          id="inc-type"
          className="h-11 w-full rounded-btn border border-border bg-card px-3 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inc-desc">What happened?</Label>
        <Textarea id="inc-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inc-action">Immediate action taken</Label>
        <Textarea id="inc-action" rows={3} value={action} onChange={(e) => setAction(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" size="touch" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : "Submit incident report"}
      </Button>
    </form>
  );
}
