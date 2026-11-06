# Republished inquiry verification

Checked October 29, 2026, approximately 20:43 UTC.

**Current disposition: owner deferred full-production verification; this review
does not block interim website publication. Full-production readiness is not
certified.**

## Owner-requested closure

On November 3, 2026, the owner requested closing the inquiry-verification task
for now and removing it from the active list. It is closed as deferred, not
as a successful inquiry journey or production-readiness certification. No
replacement task is being created. The evidence and unverified checks below
are retained for when the owner resumes full-production preparation.

## November 3 inquiry-verification prerequisite check

Checked November 3, 2026 at 22:35 UTC using anonymous GET requests only.
Deployment metadata reports a public autoscale deployment with a successful
build and primary URL
`https://dls-compliance-billing-system-demo.agilityengineers.com`.
That metadata does not establish the deployed source revision.

| Endpoint | Observed result |
| --- | --- |
| `/api/readyz` | HTTP 503, `migrations_pending`, database connection successful, 0/5 migrations recorded |
| `/api/public/forms/contact` | HTTP 200; required first name, last name, email and consent questions; optional phone, role, service and message |
| `/api/leads` | HTTP 401, `UNAUTHENTICATED` |
| `/api/leads/stages` | HTTP 401, `UNAUTHENTICATED` |
| `/api/leads/form` | HTTP 401, `UNAUTHENTICATED` |

The readiness response still lists migrations `0000_access_model` through
`0004_leads` as pending. This is a current failed prerequisite, not a new
production catalog inspection or proof of the cause. Production schema, audit
protections and deployed revision have not been newly verified in this pass.

**The inquiry journey remains incomplete.** No POST, synthetic submission,
privileged login, production database query, deployment or application change
was performed. No committed bootstrap credentials were used. Public schema
availability and anonymous denial passed these limited checks; server-side
submission validation, durable storage, authorized inbox visibility,
authenticated unauthorized-role denial and submission-specific audit evidence
remain untested. No authorized staff browser session was established.

Resume after the existing deployment/schema/audit prerequisite work is
verified, then obtain an authorized staff test session through the supported
browser handoff if needed. Run one synthetic-only journey and inspect only its
record and sanitized audit evidence. Do not treat an HTTP 202 as proof of
durability or staff visibility. This failed pre-full-production gate does not
change the owner's interim-publication deferral.

## Owner-directed deferral

The owner explicitly requested proceeding with interim website publication and
tracking the remaining checks for completion before full production. Close this
investigation under that revised scope, not as a passing readiness assessment.

The production startup probe already uses `/api/healthz`, independently of
`/api/readyz`. No publishing configuration change or false readiness response is
needed. Preserve the existing readiness diagnostics. No production DDL, deploy,
or change to inquiry availability was performed as part of this deferral.

Carry forward two pre-full-production items: reconcile the served revision and
production audit/schema protections; then verify an authorized synthetic inquiry
journey after those prerequisites pass. All failure evidence below remains
valid as historical observations, not a claim that the owner must repeat
development verification. Interim publication is not approval for sensitive
intake or clinical/billing operations.

## Authorized access-control corrections

Following the deferral, the owner authorized two bounded security fixes:
retired bootstrap credentials are now rejected for authentication, their
sessions are revoked/denied, and replacement requires verified recovery rather
than possession of the known password. Client health fields are filtered from
all core client response paths and denied on create/update without effective
`clients.health` access.

The focused API and client suites passed 56 tests against a fresh temporary
PostgreSQL instance, including revoked-session denial, single-use reset recovery,
disabled global/role health permissions, preserved health data, and permitted
non-health edits. API/workspace TypeScript checking passed. These are workspace
code fixes, not proof that production has received them or that its deferred
audit/schema issues are resolved. See `docs/access-model.md` for recovery.

## Owner verification accepted; deployment provenance investigation

The owner subsequently confirmed main-workspace verification. Treat that
prerequisite as owner-verified; do not ask them to repeat it. Fresh production
checks still return 503, five expected migrations, and zero audit functions
or triggers. Those live observations are separate from the owner's confirmed
development state.

A read-only investigation of the two successful builds found:

- November 1 build `fc67f00b-58a7-42ad-8839-6d838b7e5e6f` and October 29 build
  `a2bbf8e7-c64d-41f6-a4cc-4a2f91f635d6` produced identical frontend bundle
  filenames and reported sizes: `index-CoHjEA4d.js` (978.98 kB) and
  `index-COsvcH_m.css` (89.25 kB).
- Both runtime revisions emit the old mail warning stating that invitation and
  reset links are logged. Current source replaced this warning in the same
  change that added `providerAccount` to readiness. The live readiness response
  lacks that field.
- Latest runtime startup confirms database connectivity and liveness, not
  migration readiness. The publication check uses `/api/healthz`.
- The current API build script removes its output before rebuilding. No
  inspected configuration intentionally selects an older API bundle.

The publication succeeded but its fingerprints still match the older code.
The mechanism causing that mismatch remains unproven. Available build metadata
does not expose a source commit or image digest, and build log payloads were
truncated. This investigation did not establish that the owner failed to sync.

**Required external action:** Replit deployment support needs to identify the
source snapshot/build inputs and serving API image for the November 1 build
and explain the mismatch with the verified main workspace. Supply this report
and both build IDs. The supported production schema repair must also address
the missing audit functions/triggers and migration effects; it cannot merely
mark the journal complete. This is not another request for owner verification.
No secrets or account credentials are needed in the report.

## November 1 post-republish check

Deployment metadata confirms a successful new build
`fc67f00b-58a7-42ad-8839-6d838b7e5e6f`, created at 23:16:35 UTC
and successful at 23:18:00 UTC.

However, readiness on all three metadata-listed domains (the primary custom
domain, `durablelifeskills.com`, and the `replit.app` domain) still returns
HTTP 503 and **five** expected migrations, not the seven in this task workspace.
This establishes that the serving API's migration bundle is not the updated
workspace bundle; it is not merely a single custom-domain discrepancy.
The exact deployed source commit remains unverified.

Production read-only checks still show zero migration records, zero expected
audit functions, and zero non-internal audit-log triggers. Neither the
`uq_leads_org_submission` index nor the
`leads_submission_fingerprint_check` constraint exists in production.
The three latest recorded audit-verification attempts (October 30, October 31,
and November 1 at 05:22 UTC) failed; none is evidence of a successful audit
check after this new deployment.

The public form endpoint returns 200 and the anonymous leads endpoint returns
401. No synthetic submission was sent because the agreed readiness/audit gates
failed. No production writes were performed.

An attempt to read the main workspace's latest Git ref through its configured
remote stopped at an SSH password prompt and timed out. No credentials were
requested or bypass attempted. This task workspace contains the GitHub merge,
but that does not establish that the main publishing workspace contains it.

**Next gate:** reconcile the main publishing workspace with GitHub main through
PR 33 and verify its development readiness reports seven migrations. Repeat
production verification only once the deployed bundle reflects those changes.
Missing production audit objects remain a separate unresolved gate; a newer
bundle alone must not be treated as proof those objects were installed.

## November 1 development preparation

Merged GitHub `main` through pull request 33 into this task workspace without
conflicts and installed the frozen lockfile. Restarted the managed API
development workflow as instructed by the H3/H4 remediation note.

The API applied the development migrations and initialized successfully.
Workspace `/api/readyz` returned HTTP 200 with `status: ready`,
`applied: 7`, `total: 7`, `pending: []`, and `providerAccount: true`.
Read-only development catalog checks confirmed migration 0006's unique index
on `(org_id, submission_id, submission_fingerprint)` and the
`leads_submission_fingerprint_check` constraint.

Startup also flagged a legacy bootstrap-password account for mandatory password
change. Mail remains in development log mode, not delivery mode. The homepage
renders; its previously documented external media RSS CORS failure remains.

This completes the operator step in this task workspace, not production
verification. No publish or production database mutation was performed.
The main workspace must retain the merged code and have these development
schema changes before any later publish. Production readiness, audit integrity,
and the authorized synthetic journey still require post-deployment verification;
the development result does not clear those gates.

## Subsequent authenticated inspection

Read-only production database access succeeded on retry in the later owner
conversation. The authentication blocker described below is historical and
is no longer the current blocker.

Direct catalog and bookkeeping queries establish:

| Object | Development | Production |
| --- | --- | --- |
| Migration journal records | 5 | 0 |
| Public audit functions | 4 | 0 |
| Non-internal triggers on `public.audit_log` | 2 | 0 |

The functions checked were `audit_log_digest`, `audit_log_chain`,
`audit_log_no_rewrite`, and `audit_log_verify`. Production has the expected
application table names, including leads, activities, questions, stages, audit
log, job runs and the migration journal table. Table presence alone is not a
complete column/constraint equivalence check.

All 30 existing production audit entries have null or empty chain hashes.
The five most recent `audit.verify_chain` job records have `ok=false`, with
details referencing `audit_log_verify`. The latest recorded attempt was
2026-10-29 19:27:03 UTC. Only aggregate audit counts and sanitized job metadata
were read; no inquiry content or account credentials were retrieved.

The live readiness endpoint still returns 503, with a successful database
connection and all five migrations pending. This is a confirmed missing-audit-
protection problem, not solely missing bookkeeping. Adding journal records
alone would falsely claim the migrations completed and would not repair it.

The documented `explainSchemaDiff()` callback was attempted but is unavailable
in this session (`explainSchemaDiff is not defined`). No publish-plan diff was
obtained, and no claim is made that republishing alone will repair these
objects. The deployment has already been republished with the tables present
and the SQL audit objects absent.

### Required supported repair

Replit's managed production database rules prohibit this agent from applying
production DDL, writing a production migration script, or adding deploy/startup
DDL. The supported publishing/schema process needs to reconcile the audit
functions, triggers, existing unchained audit entries and migration journal.
Because this session cannot obtain or amend that publish plan, the owner needs
Replit Support to resolve the managed-schema synchronization gap or provide
a supported repair procedure. Do not overwrite production with development
data, blindly replay table-creating migrations, or backfill hashes and describe
that as proof of historical integrity.

After repair, verify function/trigger definitions and a successful full audit
check, establish an explicit integrity baseline for pre-repair entries, confirm
readiness, and run the authorized synthetic inquiry journey. That journey has
not been performed. No production mutations or application changes were made
during this investigation.

## Deployment and HTTP evidence

Deployment metadata reports a public autoscaling deployment at
`https://dls-compliance-billing-system-demo.agilityengineers.com`.
The latest build, `a2bbf8e7-c64d-41f6-a4cc-4a2f91f635d6`, succeeded at
20:39:03 UTC after being created at 20:37:32 UTC. This identifies the latest
successful platform build, not an independently verified source commit.

Anonymous GET checks against that primary URL returned:

| Endpoint | Result |
| --- | --- |
| `/api/readyz` | 503, `migrations_pending`; database connection successful; 0/5 migrations recorded |
| `/api/public/forms/contact` | 200; organization and expected public inquiry questions returned |
| `/api/leads` | 401, `UNAUTHENTICATED` |
| `/api/leads/stages` | 401, `UNAUTHENTICATED` |
| `/api/leads/form` | 401, `UNAUTHENTICATED` |

Readiness lists `0000_access_model`, `0001_credentialing`,
`0002_platform_hardening`, `0003_consultations`, and `0004_leads` as pending.
Unlike the earlier review, the published API now exposes the public form and
protected leads route family. This does not establish complete schema or audit
integrity.

## Production access blocker

A read-only production query through the supported database tooling
(`SELECT current_database() AS database, current_timestamp AS checked_at`)
was denied: **Production database access requires an authenticated user.**
No alternate credential path or direct production connection was attempted.

Production table definitions, migration bookkeeping, audit functions/triggers,
and current audit job outcomes remain unverified. The local migration status
implementation treats any migration-journal query failure as an empty journal;
the endpoint alone cannot distinguish missing bookkeeping from a query/access
failure. It also does not test audit protection.

## Synthetic inquiry gate

No inquiry was submitted, no production records were modified, and no
privileged login was attempted. An accepted HTTP response alone would not
prove that an inquiry was durably stored and visible to authorized staff.
The successful journey remains deferred until readiness/audit integrity can be
checked and an authorized staff test session is available. Do not use committed
bootstrap credentials or real personal information for that test.

## Remaining work

1. Restore authenticated read-only production database tooling access from an
   authorized owner session.
2. Inspect production schema, journal, audit function/trigger definitions and
   job outcomes; resolve discrepancies through the supported publishing/schema
   process, not direct production DDL or a readiness bypass.
3. Confirm readiness returns 200 and verify the deployed source revision.
4. Use an authorized synthetic-only journey to verify submission, durable
   storage, authorized inbox visibility and permission boundaries.

This note supplements, rather than replaces, the broader production-readiness
review. Its other unresolved release gates still apply. No publishing,
application changes, workflow restarts, or production database mutations were
performed.
