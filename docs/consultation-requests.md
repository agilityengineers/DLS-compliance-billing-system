# Website consultation requests

The public contact form stores requests in the existing PostgreSQL database through
`POST /api/consultation-requests`. This is **lead storage, not email delivery**.
Success is returned only after storage succeeds. There is no public read endpoint.
Authorized database operators can retrieve requests from `consultation_requests`;
the staff portal does not yet have a consultation inbox or send notifications.
Do not copy lead details into application logs, tickets, or analytics.

The database migration is applied by the existing development migration runner.
Production uses the existing managed schema publishing process; include both
`consultation_requests` and `consultation_limits` in that schema update.
Do not bypass startup readiness or run an alternative production migration path.

Controls include required consent, bounded fields, role/service allowlists, a
server-checked honeypot, JSON-only requests, rejection of browser cross-site
submissions, and atomic database-backed limits (5 attempts per IP per 15-minute
window, 200 globally). IPs are stored only as short-lived hashes with the window
included, not raw addresses; these are pseudonymous, not anonymous. Expired
counters are pruned on subsequent submissions. The existing trusted proxy setting
must correspond to the hosting proxy topology; do not trust arbitrary client
forwarding headers when hosting elsewhere.

Each form keeps an in-memory request ID for unchanged retries. A lost response can
be retried without duplicate storage. Edited requests get a new ID. Reloading the
page does not retain draft personal information or the ID. During submission,
fields are disabled to avoid edits being erased by a successful response; on any
failure they are re-enabled without resetting their values. Responses time out
after 20 seconds, with phone/email alternatives still visible.

Run focused backend regression checks with:
`pnpm exec vitest run artifacts/api-server/src/__tests__/consultations.test.ts`.
These tests use isolated in-memory PostgreSQL, not the live lead database.
