// components/admin/clients/client-contacts-tab.tsx — the people around the
// client: responsible party, guardian, emergency contact, physician, case
// manager. Rides clients.contacts.
"use client";

import { useEffect, useState } from "react";
import { CLIENT_CONTACT_KIND_LABELS, clientsApi, type ClientContact, type ClientContactInput, type ClientContactKind } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "./format";

const KINDS = Object.keys(CLIENT_CONTACT_KIND_LABELS) as ClientContactKind[];

const empty = (): ClientContactInput => ({ kind: "responsible_party", name: "", relationship: "", phone: "", email: "", address1: "", city: "", state: "", zip: "", npi: "", isPrimary: false, notes: "" });

function ContactForm({ initial, onCancel, onSubmit, busy }: { initial: ClientContactInput; onCancel: () => void; onSubmit: (input: ClientContactInput) => void; busy: boolean }) {
  const [form, setForm] = useState<ClientContactInput>(initial);
  const set = (key: keyof ClientContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
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
          <Label htmlFor="contact-kind">Role</Label>
          <select id="contact-kind" className={selectClass} value={form.kind} onChange={set("kind")}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{CLIENT_CONTACT_KIND_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="contact-name">Name</Label><Input id="contact-name" required value={form.name} onChange={set("name")} /></div>
        <div className="space-y-1.5"><Label htmlFor="contact-relationship">Relationship</Label><Input id="contact-relationship" value={form.relationship ?? ""} onChange={set("relationship")} placeholder="Mother, sister, friend…" /></div>
        <div className="space-y-1.5"><Label htmlFor="contact-phone">Phone</Label><Input id="contact-phone" type="tel" value={form.phone ?? ""} onChange={set("phone")} /></div>
        <div className="space-y-1.5"><Label htmlFor="contact-email">Email</Label><Input id="contact-email" type="email" value={form.email ?? ""} onChange={set("email")} /></div>
        {form.kind === "physician" && (
          <div className="space-y-1.5"><Label htmlFor="contact-npi">NPI</Label><Input id="contact-npi" inputMode="numeric" maxLength={10} value={form.npi ?? ""} onChange={set("npi")} placeholder="10 digits" /></div>
        )}
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="contact-address1">Address</Label><Input id="contact-address1" value={form.address1 ?? ""} onChange={set("address1")} /></div>
        <div className="space-y-1.5"><Label htmlFor="contact-city">City</Label><Input id="contact-city" value={form.city ?? ""} onChange={set("city")} /></div>
        <div className="space-y-1.5"><Label htmlFor="contact-state">State</Label><Input id="contact-state" maxLength={2} value={form.state ?? ""} onChange={set("state")} /></div>
        <div className="space-y-1.5"><Label htmlFor="contact-zip">ZIP</Label><Input id="contact-zip" maxLength={10} value={form.zip ?? ""} onChange={set("zip")} /></div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="contact-notes">Notes</Label><Textarea id="contact-notes" rows={2} value={form.notes ?? ""} onChange={set("notes")} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="contact-primary" type="checkbox" className="h-4 w-4 accent-[#5F7161]" checked={form.isPrimary ?? false} onChange={set("isPrimary")} />
        Primary contact — call this person first
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !form.name.trim()}>{busy ? "Saving…" : "Save contact"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
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

  const toInput = (c: ClientContact): ClientContactInput => ({
    kind: c.kind,
    name: c.name,
    relationship: c.relationship ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address1: c.address1 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    zip: c.zip ?? "",
    npi: c.npi ?? "",
    isPrimary: c.isPrimary,
    notes: c.notes ?? "",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Who to call, who decides, and who prescribes. The primary contact is listed first.</p>
        {editing === null && <Button size="sm" onClick={() => setEditing("new")}>Add contact</Button>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {editing === "new" && (
        <ContactForm
          initial={empty()}
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
                initial={toInput(c)}
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
                <div className="flex flex-wrap gap-x-4 text-muted-foreground">
                  {c.phone && <span>{c.phone}</span>}
                  {c.email && <span>{c.email}</span>}
                  {c.npi && <span>NPI {c.npi}</span>}
                  {(c.address1 || c.city) && <span>{[c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ")}</span>}
                </div>
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
