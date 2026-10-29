# Website consultation requests

**Superseded on 2026-10-29 by the leads feature.** The public contact form now posts to
`POST /api/public/leads`. Every inquiry lands in the portal's Leads inbox (`/admin/leads`),
moves through an admin-configurable funnel, can be assigned to an Admin or Scheduler and
converted into a client record, and the form's questions are edited in the portal at
`/admin/leads/form`. See `replit.md` ("Leads") and `artifacts/api-server/src/routes/public.ts`.

What happened to the earlier storage-only endpoint:

- `POST /api/consultation-requests`, its OpenAPI entries and its PGlite test were removed;
  the generated client was regenerated without them.
- Any rows that endpoint stored in `consultation_requests` are imported into the Leads
  inbox when the API starts (`importConsultationRequests` in
  `artifacts/api-server/src/lib/leads.ts`): each becomes a website inquiry dated when it
  was received, and the row is deleted once it is in. The import is a no-op on an empty table.
- The `consultation_requests` and `consultation_limits` tables stay in the schema, empty,
  until a later drizzle-generated migration drops them. The per-address limit now lives on
  the `leads` table (`LEAD_MAX_PER_IP` per `LEAD_WINDOW_MINUTES`).

Controls that carried over: required consent, bounded fields, a server-checked honeypot, a
database-backed per-address limit that works across API instances, and no personal details
in logs, the audit log or email.
