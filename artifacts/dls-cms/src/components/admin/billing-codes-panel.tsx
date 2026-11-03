// components/admin/billing-codes-panel.tsx — payers and the fee schedule.
// Rides billing.codes (Admin only).
"use client";

import { useEffect, useState } from "react";
import {
  BILLING_SERVICE_LABELS,
  BILLING_UNIT_LABELS,
  CLAIM_FILING_LABELS,
  PAYER_KIND_LABELS,
  billingApi,
  type BillingCode,
  type BillingCodeInput,
  type BillingService,
  type BillingUnit,
  type ClaimFilingCode,
  type Payer,
  type PayerInput,
  type PayerKind,
} from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, THead, TBody } from "@/components/ui/table";
import { agencyTodayIso } from "@workspace/time";

const selectClass = "h-10 w-full rounded-btn border border-border bg-card px-2 text-sm disabled:opacity-60";
const SERVICES = Object.keys(BILLING_SERVICE_LABELS) as BillingService[];
const UNITS = Object.keys(BILLING_UNIT_LABELS) as BillingUnit[];
const KINDS = Object.keys(PAYER_KIND_LABELS) as PayerKind[];
const FILING = Object.keys(CLAIM_FILING_LABELS) as ClaimFilingCode[];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ── payers ──────────────────────────────────────────────────────────────
const emptyPayer = (): PayerInput => ({ name: "", kind: "medicaid", payerId: "", claimFilingCode: "MC", address1: "", city: "", state: "", zip: "", phone: "", notes: "", active: true });

function PayerForm({ initial, busy, onCancel, onSubmit }: { initial: PayerInput; busy: boolean; onCancel: () => void; onSubmit: (input: PayerInput) => void }) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof PayerInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="payer-name">Name</Label><Input id="payer-name" required value={form.name} onChange={set("name")} placeholder="Health First Colorado" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="payer-kind">Kind</Label>
          <select id="payer-kind" className={selectClass} value={form.kind ?? "medicaid"} onChange={set("kind")}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{PAYER_KIND_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payer-filing">Claim filing code</Label>
          <select id="payer-filing" className={selectClass} value={form.claimFilingCode ?? "MC"} onChange={set("claimFilingCode")}>
            {FILING.map((c) => (
              <option key={c} value={c}>{CLAIM_FILING_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="payer-id">Payer / receiver id</Label><Input id="payer-id" value={form.payerId ?? ""} onChange={set("payerId")} placeholder="From the trading-partner agreement" /></div>
        <div className="space-y-1.5"><Label htmlFor="payer-phone">Phone</Label><Input id="payer-phone" type="tel" value={form.phone ?? ""} onChange={set("phone")} /></div>
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="payer-address">Address</Label><Input id="payer-address" value={form.address1 ?? ""} onChange={set("address1")} /></div>
        <div className="space-y-1.5"><Label htmlFor="payer-city">City</Label><Input id="payer-city" value={form.city ?? ""} onChange={set("city")} /></div>
        <div className="space-y-1.5"><Label htmlFor="payer-state">State</Label><Input id="payer-state" maxLength={2} value={form.state ?? ""} onChange={set("state")} /></div>
        <div className="space-y-1.5"><Label htmlFor="payer-zip">ZIP</Label><Input id="payer-zip" maxLength={10} value={form.zip ?? ""} onChange={set("zip")} /></div>
        <div className="space-y-1.5"><Label htmlFor="payer-notes">Notes</Label><Input id="payer-notes" value={form.notes ?? ""} onChange={set("notes")} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="payer-active" type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={form.active ?? true} onChange={set("active")} />
        Active (offered on the billing screen)
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !form.name.trim()}>{busy ? "Saving…" : "Save payer"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ── codes ───────────────────────────────────────────────────────────────
const emptyCode = (): BillingCodeInput => ({
  payerId: null,
  code: "",
  modifier1: "",
  modifier2: "",
  modifier3: "",
  modifier4: "",
  description: "",
  service: "SCC",
  billingUnit: "15_min",
  ratePerUnit: 0,
  effectiveDate: agencyTodayIso(),
  endDate: "",
  evvCode: "",
  allowZeroUnits: false,
  notes: "",
});

function CodeForm({ initial, payers, busy, onCancel, onSubmit }: { initial: BillingCodeInput; payers: Payer[]; busy: boolean; onCancel: () => void; onSubmit: (input: BillingCodeInput) => void }) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof BillingCodeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const t = e.target;
    const value = t.type === "checkbox" ? (t as HTMLInputElement).checked : t.type === "number" ? Number(t.value) : t.value;
    setForm((f) => ({ ...f, [key]: value }));
  };
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, payerId: form.payerId || null });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="code-code">Procedure code</Label><Input id="code-code" required value={form.code} onChange={set("code")} placeholder="T2021" maxLength={6} /></div>
        <div className="grid grid-cols-4 gap-2 sm:col-span-1">
          {(["modifier1", "modifier2", "modifier3", "modifier4"] as const).map((m, i) => (
            <div key={m} className="space-y-1.5">
              <Label htmlFor={`code-${m}`}>Mod {i + 1}</Label>
              <Input id={`code-${m}`} maxLength={2} value={form[m] ?? ""} onChange={set(m)} />
            </div>
          ))}
        </div>
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="code-description">Description</Label><Input id="code-description" required value={form.description} onChange={set("description")} placeholder="Supported community connections, 15 min" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="code-service">Service</Label>
          <select id="code-service" className={selectClass} value={form.service} onChange={set("service")}>
            {SERVICES.map((s) => (
              <option key={s} value={s}>{BILLING_SERVICE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="code-payer">Payer</Label>
          <select id="code-payer" className={selectClass} value={form.payerId ?? ""} onChange={set("payerId")}>
            <option value="">Any payer</option>
            {payers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="code-unit">Billing unit</Label>
          <select id="code-unit" className={selectClass} value={form.billingUnit ?? "15_min"} onChange={set("billingUnit")}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{BILLING_UNIT_LABELS[u]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="code-rate">Rate per unit ($)</Label><Input id="code-rate" type="number" min={0} step="0.01" required value={form.ratePerUnit} onChange={set("ratePerUnit")} /></div>
        <div className="space-y-1.5"><Label htmlFor="code-effective">Effective</Label><Input id="code-effective" type="date" required value={form.effectiveDate} onChange={set("effectiveDate")} /></div>
        <div className="space-y-1.5"><Label htmlFor="code-end">Ends</Label><Input id="code-end" type="date" value={form.endDate ?? ""} onChange={set("endDate")} /></div>
        <div className="space-y-1.5"><Label htmlFor="code-evv">EVV code</Label><Input id="code-evv" value={form.evvCode ?? ""} onChange={set("evvCode")} placeholder="When the aggregator's code differs" /></div>
        <div className="space-y-1.5"><Label htmlFor="code-notes">Notes</Label><Input id="code-notes" value={form.notes ?? ""} onChange={set("notes")} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="code-zero" type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={form.allowZeroUnits ?? false} onChange={set("allowZeroUnits")} />
        Allow a zero-unit line in a submission
      </label>
      <p className="text-xs text-muted-foreground">Claim readiness prices SCC, Job Coaching, Day Habilitation and Early Intervention from the first modifier. The others are kept for the full fee schedule.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !form.code.trim() || !form.description.trim() || !form.effectiveDate}>{busy ? "Saving…" : "Save code"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function BillingCodesPanel() {
  const [payers, setPayers] = useState<Payer[] | null>(null);
  const [codes, setCodes] = useState<BillingCode[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingPayer, setEditingPayer] = useState<"new" | string | null>(null);
  const [editingCode, setEditingCode] = useState<"new" | string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [payerFilter, setPayerFilter] = useState<string>("all");

  async function load(archived = showArchived) {
    const [p, c] = await Promise.all([billingApi.payers.list(), billingApi.codes.list({ archived })]);
    setPayers(p.payers);
    setCodes(c.codes);
  }

  useEffect(() => {
    load().catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && (!payers || !codes)) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!payers || !codes) return <p className="text-sm text-muted-foreground">Loading the fee schedule…</p>;

  const payerName = (id: string | null) => (id ? payers.find((p) => p.id === id)?.name ?? "—" : "Any payer");
  const visibleCodes = codes.filter((c) => (serviceFilter === "all" || c.service === serviceFilter) && (payerFilter === "all" || (payerFilter === "any" ? c.payerId === null : c.payerId === payerFilter)));
  const today = agencyTodayIso();

  const payerToInput = (p: Payer): PayerInput => ({
    name: p.name,
    kind: p.kind,
    payerId: p.payerId ?? "",
    claimFilingCode: p.claimFilingCode,
    address1: p.address1 ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    zip: p.zip ?? "",
    phone: p.phone ?? "",
    notes: p.notes ?? "",
    active: p.active,
  });
  const codeToInput = (c: BillingCode): BillingCodeInput => ({
    payerId: c.payerId,
    code: c.code,
    modifier1: c.modifier1 ?? "",
    modifier2: c.modifier2 ?? "",
    modifier3: c.modifier3 ?? "",
    modifier4: c.modifier4 ?? "",
    description: c.description,
    service: c.service,
    billingUnit: c.billingUnit,
    ratePerUnit: c.ratePerUnit,
    effectiveDate: c.effectiveDate,
    endDate: c.endDate ?? "",
    evvCode: c.evvCode ?? "",
    allowZeroUnits: c.allowZeroUnits,
    notes: c.notes ?? "",
  });

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-semibold text-plum">Payers</h2>
          {editingPayer === null && <Button size="sm" onClick={() => setEditingPayer("new")}>Add payer</Button>}
        </div>
        {editingPayer === "new" && (
          <PayerForm initial={emptyPayer()} busy={busy} onCancel={() => setEditingPayer(null)} onSubmit={(input) => void run(async () => { await billingApi.payers.create(input); setEditingPayer(null); })} />
        )}
        <ul className="divide-y divide-border rounded-card border border-border bg-card text-sm">
          {payers.map((p) =>
            editingPayer === p.id ? (
              <li key={p.id} className="p-2">
                <PayerForm initial={payerToInput(p)} busy={busy} onCancel={() => setEditingPayer(null)} onSubmit={(input) => void run(async () => { await billingApi.payers.update(p.id, input); setEditingPayer(null); })} />
              </li>
            ) : (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="muted">{PAYER_KIND_LABELS[p.kind]}</Badge>
                  <span className="text-muted-foreground">{p.claimFilingCode}{p.payerId ? ` · id ${p.payerId}` : ""}</span>
                  {!p.active && <Badge variant="muted">Inactive</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={busy || editingPayer !== null} onClick={() => setEditingPayer(p.id)}>Edit</Button>
                  <Button size="sm" variant="ghost" disabled={busy || editingPayer !== null} onClick={() => void run(() => billingApi.payers.remove(p.id).then(() => undefined))}>Remove</Button>
                </div>
              </li>
            )
          )}
          {payers.length === 0 && editingPayer !== "new" && <li className="px-4 py-6 text-center text-muted-foreground">No payers yet. Add Colorado Medicaid first.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-semibold text-plum">Billing codes</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select id="codes-service-filter" aria-label="Service" className="h-9 rounded-btn border border-border bg-card px-2 text-sm" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              <option value="all">Every service</option>
              {SERVICES.map((s) => (
                <option key={s} value={s}>{BILLING_SERVICE_LABELS[s]}</option>
              ))}
            </select>
            <select id="codes-payer-filter" aria-label="Payer" className="h-9 rounded-btn border border-border bg-card px-2 text-sm" value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)}>
              <option value="all">Every payer</option>
              <option value="any">Codes for any payer</option>
              {payers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input id="codes-archived" type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); void load(e.target.checked).catch((err) => setError(errorMessage(err))); }} />
              Include archived
            </label>
            {editingCode === null && <Button size="sm" onClick={() => setEditingCode("new")}>Add code</Button>}
          </div>
        </div>
        {editingCode === "new" && (
          <CodeForm initial={emptyCode()} payers={payers} busy={busy} onCancel={() => setEditingCode(null)} onSubmit={(input) => void run(async () => { await billingApi.codes.create(input); setEditingCode(null); })} />
        )}
        {editingCode !== null && editingCode !== "new" && (
          <CodeForm
            initial={codeToInput(codes.find((c) => c.id === editingCode)!)}
            payers={payers}
            busy={busy}
            onCancel={() => setEditingCode(null)}
            onSubmit={(input) => void run(async () => { await billingApi.codes.update(editingCode, input); setEditingCode(null); })}
          />
        )}
        <Table>
          <THead>
            <tr><th>Code</th><th>Description</th><th>Service</th><th>Payer</th><th>Unit</th><th className="text-right">Rate</th><th>Effective</th><th>Ends</th><th></th></tr>
          </THead>
          <TBody>
            {visibleCodes.map((c) => {
              const mods = [c.modifier1, c.modifier2, c.modifier3, c.modifier4].filter(Boolean).join(" ");
              const ended = c.endDate !== null && c.endDate < today;
              return (
                <tr key={c.id} className={c.archived ? "opacity-60" : ""}>
                  <td className="font-medium tabular-nums">{c.code}{mods && <span className="text-muted-foreground"> {mods}</span>}</td>
                  <td>{c.description}{c.archived && <Badge variant="muted" className="ml-2">Archived</Badge>}</td>
                  <td>{BILLING_SERVICE_LABELS[c.service]}</td>
                  <td className="text-muted-foreground">{payerName(c.payerId)}</td>
                  <td className="text-muted-foreground">{BILLING_UNIT_LABELS[c.billingUnit]}</td>
                  <td className="text-right tabular-nums">${c.ratePerUnit.toFixed(2)}</td>
                  <td className="tabular-nums">{fmtDate(c.effectiveDate)}</td>
                  <td className="tabular-nums">{ended ? <Badge variant="muted">Ended {fmtDate(c.endDate)}</Badge> : fmtDate(c.endDate)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" disabled={busy || editingCode !== null} onClick={() => setEditingCode(c.id)}>Edit</Button>
                      <Button size="sm" variant="ghost" disabled={busy || editingCode !== null} onClick={() => void run(() => billingApi.codes.duplicate(c.id).then(() => undefined))}>Copy</Button>
                      <Button size="sm" variant="ghost" disabled={busy || editingCode !== null} onClick={() => void run(() => billingApi.codes.update(c.id, { archived: !c.archived }).then(() => undefined))}>{c.archived ? "Restore" : "Archive"}</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleCodes.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{codes.length === 0 ? "No billing codes yet. Until there are, claims price from the practice rates." : "No codes match these filters."}</td></tr>
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
