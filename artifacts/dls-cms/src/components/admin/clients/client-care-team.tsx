// components/admin/clients/client-care-team.tsx — the drop-down inside the
// record's "Care team & weekly authorizations" section: the case managers and
// other external providers on file, each with how to reach them and the date
// they took on the role, plus a form to add one without leaving the record.
//
// These are ordinary client_contacts rows (kind case_manager or
// external_provider), so they also appear on the Contacts tab. The panel sits
// inside the record's <form>, so its contact form renders `nested`.
"use client";

import { useEffect, useState } from "react";
import { CARE_TEAM_CONTACT_KINDS, CLIENT_CONTACT_KIND_LABELS, clientsApi, type ClientContact, type ClientContactKind } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactForm, ContactSummary, contactToInput, emptyContact, isCareTeam } from "./client-contacts-tab";

/** Newest role first; anyone without a start date goes last. */
function byStartDesc(a: ClientContact, b: ClientContact) {
  return (b.startDate ?? "").localeCompare(a.startDate ?? "") || a.name.localeCompare(b.name);
}

export function ClientCareTeam({
  clientId,
  onCaseManagerChanged,
}: {
  clientId: string;
  /** Called with the current case manager's name after one is added or edited, so the record can follow. */
  onCaseManagerChanged?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ClientContact[] | null>(null);
  const [editing, setEditing] = useState<{ id: "new"; kind: ClientContactKind } | { id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const r = await clientsApi.contacts.list(clientId);
    const team = r.contacts.filter((c) => isCareTeam(c.kind)).sort(byStartDesc);
    setMembers(team);
    return team;
  }

  useEffect(() => {
    if (!open || members) return;
    let cancelled = false;
    clientsApi.contacts
      .list(clientId)
      .then((r) => {
        if (!cancelled) setMembers(r.contacts.filter((c) => isCareTeam(c.kind)).sort(byStartDesc));
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, members, clientId]);

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

  function followCaseManager(team: ClientContact[], touchedKind: ClientContactKind) {
    if (touchedKind !== "case_manager") return;
    const current = team.find((c) => c.kind === "case_manager");
    if (current) onCaseManagerChanged?.(current.name);
  }

  const count = members?.length;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40"
        aria-expanded={open}
        aria-controls="care-team-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          Case managers &amp; external providers
          {count !== undefined && <Badge variant="muted">{count}</Badge>}
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs font-normal">{open ? "Hide" : "Add or view"}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div id="care-team-panel" className="space-y-3 px-4 pb-4">
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          {editing === null && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!members} onClick={() => setEditing({ id: "new", kind: "case_manager" })}>
                Add case manager
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!members} onClick={() => setEditing({ id: "new", kind: "external_provider" })}>
                Add external provider
              </Button>
            </div>
          )}

          {editing?.id === "new" && "kind" in editing && (
            <ContactForm
              key={editing.kind}
              nested
              idPrefix="care-team"
              kinds={CARE_TEAM_CONTACT_KINDS}
              initial={emptyContact(editing.kind)}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={(input) =>
                void run(async () => {
                  await clientsApi.contacts.create(clientId, input);
                  const team = await refresh();
                  setEditing(null);
                  followCaseManager(team, input.kind);
                })
              }
            />
          )}

          {!members && !error && <p className="text-sm text-muted-foreground">Loading care team…</p>}

          {members && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {members.map((c) =>
                editing?.id === c.id ? (
                  <li key={c.id} className="p-2">
                    <ContactForm
                      nested
                      idPrefix="care-team"
                      kinds={CARE_TEAM_CONTACT_KINDS}
                      initial={contactToInput(c)}
                      busy={busy}
                      onCancel={() => setEditing(null)}
                      onSubmit={(input) =>
                        void run(async () => {
                          await clientsApi.contacts.update(clientId, c.id, input);
                          const team = await refresh();
                          setEditing(null);
                          followCaseManager(team, input.kind);
                        })
                      }
                    />
                  </li>
                ) : (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 space-y-0.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="muted">{CLIENT_CONTACT_KIND_LABELS[c.kind]}</Badge>
                        {c.relationship && <span className="text-muted-foreground">{c.relationship}</span>}
                      </div>
                      <ContactSummary c={c} />
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="ghost" disabled={busy || editing !== null} onClick={() => setEditing({ id: c.id })}>
                        Edit
                      </Button>
                      <Button
                        type="button"
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
              {members.length === 0 && editing === null && (
                <li className="px-3 py-3 text-sm text-muted-foreground">No case manager or external provider on file yet.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
