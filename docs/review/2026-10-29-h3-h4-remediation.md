# H3 / H4 remediation: concurrent conversion and import, repeat inquiries

This note records what changed for the two concurrency findings in the [production readiness review](./2026-10-29-production-readiness.md) — H3 (lead conversion and the legacy import are not concurrency-safe) and H4 (repeat inquiries can silently discard changed answers) — what the tests now prove, and the one step the deployment needs before the next publish. It does not touch the launch blockers B1–B3.

Think of the leads inbox as a front desk with one logbook. The audit found three ways two people writing in that logbook at the same moment could lose or double an entry. The fixes below make every write take its turn and define exactly what counts as "the same entry".

## What changed

### Conversion (H3, `artifacts/api-server/src/routes/clients.ts`)

- The client row, the inquiry's move to the funnel's "won" stage and the timeline entry land in one transaction. The inquiry is read under `SELECT … FOR UPDATE` inside it, and the move is conditional on the inquiry still being unconverted. A unique index on `clients.source_lead_id` and one on `leads.converted_client_id` say the same thing at the database.
- Simultaneous conversions of one inquiry produce one client and `409 LEAD_ALREADY_CONVERTED` for the rest. The 409 now carries `details.clientId`, so a request retried after its first copy succeeded can find what that copy made.
- A stage change (`PATCH /api/leads/:id`) takes the same row lock and decides everything inside its transaction, so it either lands before a conversion or is refused after it; it can never overwrite one.

### Legacy import (H3, `importConsultationRequests` in `artifacts/api-server/src/lib/leads.ts`)

- Each `consultation_requests` row is claimed under a row lock in its own transaction, and the lead records its source (`import_source`, `import_source_id`, unique). Several API processes booting at once import each row exactly once.
- The default organization is used only while it is the only organization; otherwise the rows stay put with the reason logged until `CONSULTATION_IMPORT_ORG_SLUG` names the target. Each `lead.imported` audit entry records the basis.
- The `lead.imported` audit entry is now written inside the same transaction as the lead, its timeline entry and the deletion of the source row — as the last write before the commit, because the audit chain's trigger takes a transaction-scoped lock shared by every audit writer. Once the source row is gone, that entry is the only record that an import happened, so it is no longer left to a write after the commit that a crash in between would skip for good.

### Website submissions (H4, `acceptWebsiteSubmission` in `lib/leads.ts`, `routes/public.ts`)

- The website sends a key per filled-in form (`submissionId`), kept across retries of the same answers, and the API hashes the answers. **A retry is the same key with the same answers**, or, when the site sent no key, the same answers from the same email inside the window. Whitespace-only differences are not a change.
- The key is never taken at its word. The same key with changed answers — a cached page, an older script, a bot — is stored as a second inquiry with every answer as given, cross-referenced on both timelines (`relatedBy: "submission_id"`); changed answers from the same email under a new key are stored the same way (`relatedBy: "email"`). Staff close one as a duplicate if that is what it is; nothing a person wrote is folded away unseen. The unique index on `leads` is now on (organization, key, answers), with a check that a key is never stored without its hash.
- Every attempt is recorded in `lead_submission_attempts`, and the per-address limit counts attempts — a stored inquiry, a retry, a rejected form, a honeypot hit — under a per-address advisory lock. A second advisory lock, per email, is taken after the first, so identical copies arriving together from different addresses store one inquiry even without a key, and two requests can only ever wait on each other in one direction.

## What the tests prove

`artifacts/api-server/src/__tests__/leads-concurrency.test.ts` runs against a PostgreSQL database it creates for itself and drops afterwards (never the database `TEST_DATABASE_URL` names; it refuses the application's `DATABASE_URL` and any database with "prod" in its name). It makes each race happen and checks what is left:

- eight conversions of one inquiry at once: one client, seven 409s naming it;
- a stage change waiting on an in-flight conversion is refused once it lands, and a conversion waits for an in-flight stage change and records the stage it then finds;
- a Medicaid ID clash leaves the inquiry unconverted and convertible later;
- three processes importing one table of fifteen rows: fifteen leads, no duplicates, one audit entry each; an import whose audit entry cannot be written leaves no lead and no missing source row behind until it can;
- six copies of one submission from six addresses at once: one inquiry; the same key with changed answers: a second inquiry, cross-referenced, with retries of either form folded into the right one; six copies of a corrected form under the original's key at once: exactly one new inquiry; identical answers without a key from six addresses at once: one inquiry;
- the per-address limit counts rejected forms, honeypot hits and retries, and lets exactly the allowed number of a burst through.

The sequential tests in `leads.test.ts` that the audit said "encode the lossy behaviour" now assert the retry behaviour above instead.

## What the deployment needs

- **Apply migration `0006_leads_submission_identity` to the development database before the next publish.** Replit Publish copies the development schema and migrations only run on boot outside production, so run the API once in the workspace after pulling this change (`pnpm --filter @workspace/api-server run dev`) and confirm `GET /api/readyz` reports nothing pending. The migration replaces the unique index on (organization, key) with one on (organization, key, answers) and adds a check constraint; both are satisfied by every row the current code has written, and it changes no data.
- Nothing else. `LEAD_MAX_PER_IP` (default 8 per `LEAD_WINDOW_MINUTES`, default 10) already counts attempts rather than inquiries.

## One thing to know

Inquiries stored before this change carry a hash computed without the whitespace rule. A retry of such an inquiry that arrives inside the window after the deploy and contains a run of spaces or a line break in an answer will be stored as a second inquiry rather than folded, cross-referenced to the first. The window is ten minutes; after that, nothing differs.
