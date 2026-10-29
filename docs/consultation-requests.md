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
  - **Which organization.** The stored rows carry none. They are filed under the default
    organization only while it is the only organization; once there are two, the boot
    leaves them in place and logs why, until `CONSULTATION_IMPORT_ORG_SLUG` names the
    organization they belong to. Each imported lead's audit entry records the basis
    (`sole_organization` or `configured`).
  - **Several API processes starting at once** import each row once. A row is claimed under
    a row lock in its own transaction, and the lead carries the source row's id
    (`import_source` = `consultation_requests`, `import_source_id`, unique), so a second
    process either waits and finds the row gone or inserts nothing and removes the row.
- The `consultation_requests` and `consultation_limits` tables stay in the schema, empty,
  until a later drizzle-generated migration drops them.
- The per-address limit counts **attempts** in `lead_submission_attempts` (`LEAD_MAX_PER_IP`
  per `LEAD_WINDOW_MINUTES`): a stored inquiry, a retry, a rejected form and a honeypot hit
  all count, and the count is taken under a per-address advisory lock so simultaneous
  requests cannot slip past it together.
- A retry is recognised by the website's per-form key (`submissionId`, kept across retries
  of the same answers and unique per organization on `leads`), or, without one, by identical
  answers from the same email inside the window. A retry adds a timeline entry to the
  inquiry it repeats. A submission with **different** answers from the same email is stored
  as its own inquiry, cross-referenced on both timelines, so a corrected message or a second
  family member is never lost; staff close one as a duplicate if that is what it is.

Controls that carried over: required consent, bounded fields, a server-checked honeypot, a
database-backed per-address limit that works across API instances, and no personal details
in logs, the audit log or email.
