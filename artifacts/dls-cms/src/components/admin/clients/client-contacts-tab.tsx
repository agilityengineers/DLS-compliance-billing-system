// components/admin/clients/client-contacts-tab.tsx — the people around the
// client: responsible party, guardian, emergency contact, physician, and the
// care team (case manager, other external providers). Rides clients.contacts.
// ContactForm is shared with the record's "Care team" drop-down.
"use client";

import { useEffect, useState } from "react";
import { CARE_TEAM_CONTACT_KINDS, CLIENT_CONTACT_KIND_LABELS, clientsApi, type ClientContact, type ClientContactInput, type ClientContactKind } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "./format";

const KINDS = Object.keys(CLIENT_CONTACT_KIND_LABELS) as ClientContactKind[];

export const emptyContact = (kind: ClientContactKind = "responsible_party"): ClientContactInput => ({
  kind,
  name: "",
  relationship: "",
  phone: "",
  phoneWork: "",
  phoneCell: "",
  email: "",
  address1: "",
  city: "",
  state: "",
  zip: "",
  npi: "",
  isPrimary: false,
  notes: "",
  startDate: "",
});

export const isCareTeam = (kind: ClientContactKind) => CARE_TEAM_CONTACT_KINDS.includes(kind);

/**
 * One contact's fields. `kinds` narrows the Role choices (the Care team
 * drop-down offers only case manager and external provider). `nested` renders
 * a plain group instead of a <form>, for use inside another form: Enter in a
 * field then saves this contact rather than submitting the outer form.
 */
export function ContactForm({
  initial,
  onCancel,
  onSubmit,
  busy,
  kinds = KINDS,
  nested = false,
  idPrefix = "contact",
}: {
  initial: ClientContactInput;
  onCancel: () => void;
  onSubmit: (input: ClientContactInput) => void;
  busy: boolean;
  kinds?: readonly ClientContactKind[];
  nested?: boolean;
  idPrefix?: string;
}) {
  const [form, setForm] = useState<ClientContactInput>(initial);
  const set = (key: keyof ClientContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const id = (field: string) => `${idPrefix}-${field}`;
  const careTeam = isCareTeam(form.kind);
  const canSave = !busy && form.name.trim().length > 0;
  const submit = () => {
    if (canSave) onSubmit(form);
  };

  const fields = (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={id("kind")}>Role</Label>
          <select id={id("kind")} className={selectClass} value={form.kind} onChange={set("kind")}>
            {kinds.map((k) => (
              <option key={k} value={k}>{CLIENT_CONTACT_KIND_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor={id("name")}>Name</Label><Input id={id("name")} required value={form.name} onChange={set("name")} /></div>
        {careTeam ? (
          <div className="space-y-1.5">
            <Label htmlFor={id("relationship")}>Agency / specialty</Label>
            <Input
              id={id("relationship")}
              value={form.relationship ?? ""}
              onChange={set("relationship")}
              placeholder={form.kind === "case_manager" ? "Case management agency" : "Therapist, PCP, behaviorist…"}
            />
          </div>
        ) : (
          <div className="space-y-1.5"><Label htmlFor={id("relationship")}>Relationship</Label><Input id={id("relationship")} value={form.relationship ?? ""} onChange={set("relationship")} placeholder="Mother, sister, friend…" /></div>
        )}
        {careTeam ? (
          <>
            <div className="space-y-1.5"><Label htmlFor={id("phoneWork")}>Work phone</Label><Input id={id("phoneWork")} type="tel" value={form.phoneWork ?? ""} onChange={set("phoneWork")} /></div>
            <div className="space-y-1.5"><Label htmlFor={id("phoneCell")}>Cell phone</Label><Input id={id("phoneCell")} type="tel" value={form.phoneCell ?? ""} onChange={set("phoneCell")} /></div>
          </>
        ) : (
          <div className="space-y-1.5"><Label htmlFor={id("phone")}>Phone</Label><Input id={id("phone")} type="tel" value={form.phone ?? ""} onChange={set("phone")} /></div>
        )}
        <div className="space-y-1.5"><Label htmlFor={id("email")}>Email</Label><Input id={id("email")} type="email" value={form.email ?? ""} onChange={set("email")} /></div>
        {careTeam && (
          <div className="space-y-1.5">
            <Label htmlFor={id("startDate")}>{form.kind === "case_manager" ? "Became case manager on" : "Became provider on"}</Label>
            <Input id={id("startDate")} type="date" value={form.startDate ?? ""} onChange={set("startDate")} />
          </div>
        )}
        {(form.kind === "physician" || form.kind === "external_provider") && (
          <div className="space-y-1.5"><Label htmlFor={id("npi")}>NPI</Label><Input id={id("npi")} inputMode="numeric" maxLength={10} value={form.npi ?? ""} onChange={set("npi")} placeholder="10 digits" /></div>
        )}
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor={id("address1")}>Address</Label><Input id={id("address1")} value={form.address1 ?? ""} onChange={set("address1")} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("city")}>City</Label><Input id={id("city")} value={form.city ?? ""} onChange={set("city")} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("state")}>State</Label><Input id={id("state")} maxLength={2} value={form.state ?? ""} onChange={set("state")} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("zip")}>ZIP</Label><Input id={id("zip")} maxLength={10} value={form.zip ?? ""} onChange={set("zip")} /></div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor={id("notes")}>Notes</Label><Textarea id={id("notes")} rows={2} value={form.notes ?? ""} onChange={set("notes")} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id={id("primary")} type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={form.isPrimary ?? false} onChange={set("isPrimary")} />
        Primary contact — call this person first
      </label>
      <div className="flex gap-2">
        <Button type={nested ? "button" : "submit"} size="sm" disabled={!canSave} onClick={nested ? submit : undefined}>{busy ? "Saving…" : "Save contact"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );

  const className = "space-y-3 rounded-md border border-border bg-muted/30 p-4";
  if (nested) {
    return (
      <div
        role="group"
        aria-label="Contact details"
        className={className}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
            e.preventDefault();
            submit();
          }
        }}
      >
        {fields}
      </div>
    );
  }
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {fields}
    </form>
  );
}

/** The one-line summary of how to reach a contact, shared with the Care team section. */
export function ContactSummary({ c }: { c: ClientContact }) {
  return (
    <div className="flex flex-wrap gap-x-4 text-muted-foreground">
      {c.phone && <span>{c.phone}</span>}
      {c.phoneWork && <span>Work {c.phoneWork}</span>}
      {c.phoneCell && <span>Cell {c.phoneCell}</span>}
      {c.email && <span>{c.email}</span>}
      {c.npi && <span>NPI {c.npi}</span>}
      {c.startDate && <span>Since {formatIsoDate(c.startDate)}</span>}
      {(c.address1 || c.city) && <span>{[c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ")}</span>}
    </div>
  );
}

/** YYYY-MM-DD → "Mar 4, 2026", without a timezone shift. */
export function formatIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function contactToInput(c: ClientContact): ClientContactInput {
  return {
    kind: c.kind,
    name: c.name,
    relationship: c.relationship ?? "",
    phone: c.phone ?? "",
    phoneWork: c.phoneWork ?? "",
    phoneCell: c.phoneCell ?? "",
    email: c.email ?? "",
    address1: c.address1 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    zip: c.zip ?? "",
    npi: c.npi ?? "",
    isPrimary: c.isPrimary,
    notes: c.notes ?? "",
    startDate: c.startDate ?? "",
  };
}

export function ClientContactsTab({ clientId }: { clientId: string }) {
  const [contacts, setContacts] = useState<ClientContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientsApi.contacts
      .list(clientId)
      .then((r) => {
        if (!cancelled) setContacts(r.contacts);
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

  function refresh() {
    return clientsApi.contacts.list(clientId).then((r) => setContacts(r.contacts));
  }

  if (error && !contacts) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!contacts) return <p className="text-sm text-muted-foreground">Loading contacts…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Who to call, who decides, and who prescribes. The primary contact is listed first.</p>
        {editing === null && <Button size="sm" onClick={() => setEditing("new")}>Add contact</Button>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {editing === "new" && (
        <ContactForm
          initial={emptyContact()}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            void run(async () => {
              await clientsApi.contacts.create(clientId, input);
              await refresh();
              setEditing(null);
            })
          }
        />
      )}
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {contacts.map((c) =>
          editing === c.id ? (
            <li key={c.id} className="p-2">
              <ContactForm
                initial={contactToInput(c)}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSubmit={(input) =>
                  void run(async () => {
                    await clientsApi.contacts.update(clientId, c.id, input);
                    await refresh();
                    setEditing(null);
                  })
                }
              />
            </li>
          ) : (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 space-y-0.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="muted">{CLIENT_CONTACT_KIND_LABELS[c.kind]}</Badge>
                  {c.isPrimary && <Badge variant="success">Primary</Badge>}
                  {c.relationship && <span className="text-muted-foreground">{c.relationship}</span>}
                </div>
                <ContactSummary c={c} />
                {c.notes && <p className="whitespace-pre-wrap text-muted-foreground">{c.notes}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" disabled={busy || editing !== null} onClick={() => setEditing(c.id)}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || editing !== null}
                  onClick={() =>
                    void run(async () => {
                      await clientsApi.contacts.remove(clientId, c.id);
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
        {contacts.length === 0 && editing !== "new" && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No contacts on file yet.</li>}
      </ul>
    </div>
  );
}
