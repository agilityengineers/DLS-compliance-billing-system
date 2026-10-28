// components/admin/leads/new-lead-form.tsx — an inquiry that did not come
// through the website: a phone call, a walk-in, a referral packet. Collapsed
// by default, like the Settings screen's "Add account".
"use client";

import { useState } from "react";
import { leadsApi } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NewLeadForm({ onCreated }: { onCreated: (leadId: string) => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await leadsApi.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setNote("");
      onCreated(res.lead.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-card border border-border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">Add an inquiry by hand (phone call, walk-in, referral packet)</summary>
      <form onSubmit={submit} className="space-y-4 border-t border-border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lead-first">First name</Label>
            <Input id="lead-first" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-last">Last name</Label>
            <Input id="lead-last" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-email">Email</Label>
            <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-phone">Phone</Label>
            <Input id="lead-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-note">What they told you</Label>
          <Textarea id="lead-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called about job coaching for her son; prefers afternoons." />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !firstName.trim() || !lastName.trim()}>{saving ? "Saving…" : "Add inquiry"}</Button>
        </div>
      </form>
    </details>
  );
}
