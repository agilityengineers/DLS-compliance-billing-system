// components/admin/clients/client-insurance-tab.tsx — primary / secondary
// coverage with the member and group numbers a claim needs. Rides
// clients.insurance.
"use client";

import { useEffect, useState } from "react";
import { clientsApi, type ClientPolicy, type ClientPolicyInput, type PolicyStatus, type PolicyType } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, selectClass } from "./format";

const TYPES: PolicyType[] = ["primary", "secondary", "tertiary"];

const empty = (): ClientPolicyInput => ({ policyType: "primary", payerName: "", memberId: "", groupNumber: "", status: "active", startDate: "", endDate: "", policyHolderName: "", policyHolderRelationship: "", notes: "" });

function PolicyForm({ initial, onCancel, onSubmit, busy }: { initial: ClientPolicyInput; onCancel: () => void; onSubmit: (input: ClientPolicyInput) => void; busy: boolean }) {
  const [form, setForm] = useState<ClientPolicyInput>(initial);
  const set = (key: keyof ClientPolicyInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="policy-type">Coverage</Label>
          <select id="policy-type" className={selectClass} value={form.policyType ?? "primary"} onChange={set("policyType")}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="policy-payer">Payer</Label><Input id="policy-payer" required value={form.payerName} onChange={set("payerName")} placeholder="Health First Colorado" /></div>
        <div className="space-y-1.5"><Label htmlFor="policy-member">Member ID</Label><Input id="policy-member" value={form.memberId ?? ""} onChange={set("memberId")} /></div>
        <div className="space-y-1.5"><Label htmlFor="policy-group">Group number</Label><Input id="policy-group" value={form.groupNumber ?? ""} onChange={set("groupNumber")} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="policy-status">Status</Label>
          <select id="policy-status" className={selectClass} value={form.status ?? "active"} onChange={set("status")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="policy-start">Start</Label><Input id="policy-start" type="date" value={form.startDate ?? ""} onChange={set("startDate")} /></div>
        <div className="space-y-1.5"><Label htmlFor="policy-end">End</Label><Input id="policy-end" type="date" value={form.endDate ?? ""} onChange={set("endDate")} /></div>
        <div className="space-y-1.5"><Label htmlFor="policy-holder">Policy holder</Label><Input id="policy-holder" value={form.policyHolderName ?? ""} onChange={set("policyHolderName")} placeholder="Leave blank when it is the client" /></div>
        <div className="space-y-1.5"><Label htmlFor="policy-holder-rel">Holder's relationship</Label><Input id="policy-holder-rel" value={form.policyHolderRelationship ?? ""} onChange={set("policyHolderRelationship")} /></div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="policy-notes">Notes</Label><Textarea id="policy-notes" rows={2} value={form.notes ?? ""} onChange={set("notes")} /></div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !form.payerName.trim()}>{busy ? "Saving…" : "Save policy"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function ClientInsuranceTab({ clientId }: { clientId: string }) {
  const [policies, setPolicies] = useState<ClientPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientsApi.policies
      .list(clientId)
      .then((r) => {
        if (!cancelled) setPolicies(r.policies);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => clientsApi.policies.list(clientId).then((r) => setPolicies(r.policies));

  if (error && !policies) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!policies) return <p className="text-sm text-muted-foreground">Loading policies…</p>;

  const toInput = (p: ClientPolicy): ClientPolicyInput => ({
    policyType: p.policyType,
    payerName: p.payerName,
    memberId: p.memberId ?? "",
    groupNumber: p.groupNumber ?? "",
    status: p.status as PolicyStatus,
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    policyHolderName: p.policyHolderName ?? "",
    policyHolderRelationship: p.policyHolderRelationship ?? "",
    notes: p.notes ?? "",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Primary coverage goes on the claim; secondary is billed after the primary pays.</p>
        {editing === null && <Button size="sm" onClick={() => setEditing("new")}>Add policy</Button>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {editing === "new" && (
        <PolicyForm
          initial={empty()}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            void run(async () => {
              await clientsApi.policies.create(clientId, input);
              await refresh();
              setEditing(null);
            })
          }
        />
      )}
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {policies.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="p-2">
              <PolicyForm
                initial={toInput(p)}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSubmit={(input) =>
                  void run(async () => {
                    await clientsApi.policies.update(clientId, p.id, input);
                    await refresh();
                    setEditing(null);
                  })
                }
              />
            </li>
          ) : (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-0.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.payerName}</span>
                  <Badge variant="default">{p.policyType[0]!.toUpperCase() + p.policyType.slice(1)}</Badge>
                  <Badge variant={p.status === "active" ? "success" : "muted"}>{p.status === "active" ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 text-muted-foreground">
                  {p.memberId && <span>Member {p.memberId}</span>}
                  {p.groupNumber && <span>Group {p.groupNumber}</span>}
                  {(p.startDate || p.endDate) && <span>{formatDate(p.startDate)} → {formatDate(p.endDate)}</span>}
                  {p.policyHolderName && <span>Holder: {p.policyHolderName}{p.policyHolderRelationship ? ` (${p.policyHolderRelationship})` : ""}</span>}
                </div>
                {p.notes && <p className="whitespace-pre-wrap text-muted-foreground">{p.notes}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" disabled={busy || editing !== null} onClick={() => setEditing(p.id)}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || editing !== null}
                  onClick={() =>
                    void run(async () => {
                      await clientsApi.policies.remove(clientId, p.id);
                      await refresh();
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          )
        )}
        {policies.length === 0 && editing !== "new" && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No policies on file yet.</li>}
      </ul>
    </div>
  );
}
