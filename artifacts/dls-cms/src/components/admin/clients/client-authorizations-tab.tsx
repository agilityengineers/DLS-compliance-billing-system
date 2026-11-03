// components/admin/clients/client-authorizations-tab.tsx — prior
// authorizations as records: number, payer, service, period, approved units,
// weekly cap, and how much of each has been used. Rides clients.authorizations.
//
// Usage comes from the notes this app can see (the same source claim
// readiness reads); the page passes it in so this tab stays a plain client
// component.
"use client";

import { useEffect, useState } from "react";
import {
  AUTHORIZATION_SERVICE_LABELS,
  AUTHORIZATION_UNIT_BASIS_LABELS,
  clientsApi,
  type AuthorizationService,
  type AuthorizationUnitBasis,
  type ClientAuthorization,
  type ClientAuthorizationInput,
} from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { daysUntil, formatDate, selectClass } from "./format";

const SERVICES = Object.keys(AUTHORIZATION_SERVICE_LABELS) as AuthorizationService[];
const BASES = Object.keys(AUTHORIZATION_UNIT_BASIS_LABELS) as AuthorizationUnitBasis[];

/** Units delivered per service inside a period, keyed by service; what the page computed from the notes. */
export type AuthorizationUsage = (auth: ClientAuthorization) => number | null;

const empty = (today: string): ClientAuthorizationInput => ({
  authNumber: "",
  payerName: "",
  service: "SCC",
  billingCode: "",
  startDate: today,
  endDate: "",
  approvedUnits: 0,
  unitBasis: "unit",
  weeklyCapUnits: null,
  ratePerUnit: null,
  status: "active",
  permitOverBudget: false,
  excludeFromSubmission: false,
  notes: "",
});

type Health = { label: string; variant: "success" | "warning" | "destructive" | "muted" };

/** Healthy / Monitor / Action needed from the burn rate and the days left — the prototype's three-state read, kept. */
function healthOf(auth: ClientAuthorization, used: number | null, today: string): Health {
  if (auth.status === "void") return { label: "Void", variant: "muted" };
  if (auth.status === "pending") return { label: "Pending", variant: "warning" };
  const left = daysUntil(auth.endDate, today);
  if (left !== null && left < 0) return { label: "Expired", variant: "muted" };
  const pct = used !== null && auth.approvedUnits > 0 ? used / auth.approvedUnits : 0;
  if (pct >= 1) return { label: auth.permitOverBudget ? "Over budget (permitted)" : "Exhausted", variant: "destructive" };
  if ((left !== null && left <= 30) || pct >= 0.98) return { label: "Action needed", variant: "destructive" };
  if ((left !== null && left <= 60) || pct >= 0.85) return { label: "Monitor", variant: "warning" };
  return { label: "Healthy", variant: "success" };
}

function AuthorizationForm({ initial, onCancel, onSubmit, busy }: { initial: ClientAuthorizationInput; onCancel: () => void; onSubmit: (input: ClientAuthorizationInput) => void; busy: boolean }) {
  const [form, setForm] = useState<ClientAuthorizationInput>(initial);
  const set = (key: keyof ClientAuthorizationInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const t = e.target;
    const value = t.type === "checkbox" ? (t as HTMLInputElement).checked : t.type === "number" ? (t.value === "" ? null : Number(t.value)) : t.value;
    setForm((f) => ({ ...f, [key]: value }));
  };
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, approvedUnits: Number(form.approvedUnits) || 0 });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="auth-number">Authorization #</Label><Input id="auth-number" value={form.authNumber ?? ""} onChange={set("authNumber")} placeholder="PA-2026-44817" /></div>
        <div className="space-y-1.5"><Label htmlFor="auth-payer">Payer</Label><Input id="auth-payer" value={form.payerName ?? ""} onChange={set("payerName")} placeholder="Health First Colorado" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="auth-service">Service</Label>
          <select id="auth-service" className={selectClass} value={form.service} onChange={set("service")}>
            {SERVICES.map((s) => (
              <option key={s} value={s}>{AUTHORIZATION_SERVICE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="auth-code">Billing code</Label><Input id="auth-code" value={form.billingCode ?? ""} onChange={set("billingCode")} placeholder="T2021" /></div>
        <div className="space-y-1.5"><Label htmlFor="auth-start">Start</Label><Input id="auth-start" type="date" required value={form.startDate} onChange={set("startDate")} /></div>
        <div className="space-y-1.5"><Label htmlFor="auth-end">End</Label><Input id="auth-end" type="date" required value={form.endDate} onChange={set("endDate")} /></div>
        <div className="space-y-1.5"><Label htmlFor="auth-units">Approved amount</Label><Input id="auth-units" type="number" min={0} step="any" required value={form.approvedUnits ?? ""} onChange={set("approvedUnits")} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="auth-basis">Counted in</Label>
          <select id="auth-basis" className={selectClass} value={form.unitBasis ?? "unit"} onChange={set("unitBasis")}>
            {BASES.map((b) => (
              <option key={b} value={b}>{AUTHORIZATION_UNIT_BASIS_LABELS[b]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="auth-weekly">Weekly cap (same basis)</Label><Input id="auth-weekly" type="number" min={0} step="any" value={form.weeklyCapUnits ?? ""} onChange={set("weeklyCapUnits")} placeholder="None" /></div>
        <div className="space-y-1.5"><Label htmlFor="auth-rate">Rate per unit ($)</Label><Input id="auth-rate" type="number" min={0} step="0.01" value={form.ratePerUnit ?? ""} onChange={set("ratePerUnit")} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="auth-status">Status</Label>
          <select id="auth-status" className={selectClass} value={form.status ?? "active"} onChange={set("status")}>
            <option value="active">Active</option>
            <option value="pending">Pending (not yet approved)</option>
            <option value="void">Void</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4"><Label htmlFor="auth-notes">Notes</Label><Textarea id="auth-notes" rows={2} value={form.notes ?? ""} onChange={set("notes")} /></div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input id="auth-over" type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={form.permitOverBudget ?? false} onChange={set("permitOverBudget")} />
          Permit billing past the approved amount
        </label>
        <label className="flex items-center gap-2">
          <input id="auth-exclude" type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={form.excludeFromSubmission ?? false} onChange={set("excludeFromSubmission")} />
          Exclude from claim submissions
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !form.startDate || !form.endDate}>{busy ? "Saving…" : "Save authorization"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function ClientAuthorizationsTab({ clientId, today, usage }: { clientId: string; today: string; usage: AuthorizationUsage }) {
  const [auths, setAuths] = useState<ClientAuthorization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientsApi.authorizations
      .list(clientId)
      .then((r) => {
        if (!cancelled) setAuths(r.authorizations);
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
  const refresh = () => clientsApi.authorizations.list(clientId).then((r) => setAuths(r.authorizations));

  if (error && !auths) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!auths) return <p className="text-sm text-muted-foreground">Loading authorizations…</p>;

  const toInput = (a: ClientAuthorization): ClientAuthorizationInput => ({
    authNumber: a.authNumber ?? "",
    payerName: a.payerName ?? "",
    service: a.service,
    billingCode: a.billingCode ?? "",
    startDate: a.startDate,
    endDate: a.endDate,
    approvedUnits: a.approvedUnits,
    unitBasis: a.unitBasis,
    weeklyCapUnits: a.weeklyCapUnits,
    ratePerUnit: a.ratePerUnit,
    status: a.status,
    permitOverBudget: a.permitOverBudget,
    excludeFromSubmission: a.excludeFromSubmission,
    notes: a.notes ?? "",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Each authorization with its period, approved amount and what has been used against it so far.</p>
        {editing === null && <Button size="sm" onClick={() => setEditing("new")}>Add authorization</Button>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {editing === "new" && (
        <AuthorizationForm
          initial={empty(today)}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            void run(async () => {
              await clientsApi.authorizations.create(clientId, input);
              await refresh();
              setEditing(null);
            })
          }
        />
      )}
      <ul className="space-y-3">
        {auths.map((a) => {
          if (editing === a.id) {
            return (
              <li key={a.id}>
                <AuthorizationForm
                  initial={toInput(a)}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={(input) =>
                    void run(async () => {
                      await clientsApi.authorizations.update(clientId, a.id, input);
                      await refresh();
                      setEditing(null);
                    })
                  }
                />
              </li>
            );
          }
          const used = usage(a);
          const health = healthOf(a, used, today);
          const left = daysUntil(a.endDate, today);
          const pct = used !== null && a.approvedUnits > 0 ? Math.min(100, Math.round((used / a.approvedUnits) * 100)) : null;
          const remaining = used !== null ? Math.max(0, a.approvedUnits - used) : null;
          const basis = AUTHORIZATION_UNIT_BASIS_LABELS[a.unitBasis].toLowerCase();
          return (
            <li key={a.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{AUTHORIZATION_SERVICE_LABELS[a.service]}</span>
                    {a.billingCode && <code className="rounded bg-muted px-1 text-xs">{a.billingCode}</code>}
                    <Badge variant={health.variant}>{health.label}</Badge>
                    {a.excludeFromSubmission && <Badge variant="muted">Not submitted</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-muted-foreground">
                    {a.authNumber && <span>Auth {a.authNumber}</span>}
                    {a.payerName && <span>{a.payerName}</span>}
                    <span>{formatDate(a.startDate)} → {formatDate(a.endDate)}{left !== null && left >= 0 && a.status === "active" ? ` · ${left} days left` : ""}</span>
                    {a.weeklyCapUnits !== null && <span>Weekly cap {a.weeklyCapUnits} {basis}</span>}
                    {a.ratePerUnit !== null && <span>${a.ratePerUnit.toFixed(2)} per unit</span>}
                  </div>
                  {a.notes && <p className="whitespace-pre-wrap text-muted-foreground">{a.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" disabled={busy || editing !== null} onClick={() => setEditing(a.id)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || editing !== null}
                    onClick={() =>
                      void run(async () => {
                        await clientsApi.authorizations.remove(clientId, a.id);
                        await refresh();
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{used !== null ? `${used} of ${a.approvedUnits} ${basis} used` : `${a.approvedUnits} ${basis} approved`}</span>
                  <span>{remaining !== null ? `${remaining} remaining` : "Usage not available for this service"}</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-pill bg-muted" role="meter" aria-valuemin={0} aria-valuemax={a.approvedUnits} aria-valuenow={used ?? 0} aria-label={`${AUTHORIZATION_SERVICE_LABELS[a.service]} used`}>
                  <div
                    className={health.variant === "destructive" ? "bg-pill-danger-fg" : health.variant === "warning" ? "bg-pill-warning-fg" : "bg-plum-accent"}
                    style={{ width: `${pct ?? 0}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
        {auths.length === 0 && editing !== "new" && (
          <li className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No authorizations on file yet.</li>
        )}
      </ul>
    </div>
  );
}
