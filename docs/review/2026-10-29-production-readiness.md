# DLS production-readiness audit

**Date:** October 29, 2026  
**Decision: NO-GO for full operational production use.**  
**Baseline:** `d13be28`, following the merged leads and service-area changes. Working tree was clean before the audit.

Recent changes are present in the live artifact source and pass automated checks, but the running development API and published API do not expose the new leads endpoints. In addition, substantial care-management functionality remains demo-backed. Passing tests does not remove those launch blockers.

This was an audit, not remediation. No application source, dependencies, settings, existing database records, or production data were changed. Database tests used a newly initialized, isolated PostgreSQL instance under `/tmp`, never the application's database. Browser submission was intercepted; no inquiry was sent. No publishing or workflow restart was performed because restarting the current API would apply migrations and import existing consultations.

## Verification results

| Check | Result |
|---|---|
| Recent changes in source | Present: leads inbox, public schema/form, editable questions/stages, conversion, service-area content |
| Full workspace type checking | Passed as the first stage of `pnpm run build` |
| Bare root build | Failed: mockup-sandbox requires `PORT`; not a TypeScript failure |
| Web build with artifact environment | Passed: `PORT=24496 BASE_PATH=/ pnpm --filter @workspace/dls-cms run build` |
| API build | Passed: `pnpm --filter @workspace/api-server run build` |
| Tests without scratch DB | 112 passed, 103 skipped |
| Tests with isolated PostgreSQL | **215 passed, 14 test files, none skipped** |
| Development readiness | HTTP 503; 4/5 migrations recorded, `0004_leads` pending |
| Development public form-schema route | HTTP 404, “No such API route” |
| Published health | HTTP 200 at `/api/healthz` |
| Published readiness | HTTP 503; 0/4 migrations recorded, database connectivity successful |
| Published new API routes | `/api/public/forms/contact` and `/api/leads`: HTTP 404, “No such API route” |
| Published login/contact documents | HTTP 200 |
| Browser desktop and 390px mobile | Public pages render without document-level horizontal overflow; homepage 28/28 images loaded after scrolling |
| Browser form validation/failure | Required fields enforced; simulated 503 retains values and consent and displays honest failure |
| Anonymous admin route | `/admin/leads` redirects to `/login`; no inbox exposed |
| Signed-in browser journey | **Blocked:** no authorized test credentials; successful submission, editor and conversion not verified in the running UI |
| Read-only production SQL | **Blocked:** platform requires an authenticated user |
| Dependency scan | Completed; findings require remediation/triage, detailed below |
| Static security scan | Completed; two medium findings, neither established as an exploitable production issue |
| Privacy dataflow scan | Completed; zero findings—not a privacy/compliance certification |

Tests cover public submission, validation, limiter, sequential duplicates, feature grants, organization isolation, inbox operations, conversion, configuration, legacy import and other auth/platform behavior. They run an app built from current source against an isolated database. They do **not** demonstrate that the published revision or existing production schema matches it.

The production URL came from deployment metadata: `https://dls-compliance-billing-system-demo.agilityengineers.com`. The deployment is public, autoscaling, and reports a successful build. That status is not evidence of application readiness.

## Launch blockers

### B1 — The running APIs do not match the newly merged frontend

**Confirmed by HTTP, logs and source comparison.** Development and production both return route-not-found for the new public form-schema endpoint. Production also returns route-not-found for the inbox endpoint, rather than the expected authentication refusal. The current website posts to `/api/public/leads` and fetches `/api/public/forms/contact` (`site/js/main.js:218-219`).

Development reports five expected migrations with the leads migration pending; production reports only four expected migrations. This strongly indicates an older production bundle, not merely a disabled feature. The development process likewise predates the current code. The source build succeeds but was not activated during this audit.

**Impact:** the recent leads workflow is not available end to end in the running system. Static fallback fields do not fix the missing submission backend.

**Required next action:** reconcile development startup/schema first under explicit authorization, then inspect the managed publishing schema diff and publish a matched frontend/API revision. Confirm readiness, public schema, submission, inbox, form editing and conversion after deployment. Do not blindly replay migrations against production.

### B2 — Full care and billing operations still use synthetic, in-memory data

**Confirmed in code.** `artifacts/dls-cms/vite.config.ts:38` forces `NEXT_PUBLIC_DEMO_MODE` to true. Real API authentication is separate and defaults on. `artifacts/dls-cms/src/lib/data/repo-core.ts` continues to use the demo store for physician orders, visits and scheduling; other care/billing repositories retain demo branches. Real leads and newly created client records are exceptions, not proof of full persistence.

**Impact:** real accounts can reach screens that look operational while underlying records are synthetic or not durable/shared. This is not suitable for clinical, payroll, compliance or claims records.

**Required next action:** decide a restricted launch scope and explicitly disable unfinished modules, or implement durable tenant-scoped operations and verify reload/cross-session persistence before full launch. Do not “fix” this by merely changing the demo flag—the old Supabase branches and empty SDK shims are not a complete production backend.

### B3 — Production readiness and audit integrity are unresolved

**Confirmed symptom; exact production object state unverified.** `/api/readyz` returns 503 despite a working database connection. Deployment logs at 19:27 UTC report `audit.verify_chain` failing while calling `audit_log_verify()`. Direct production SQL inspection was denied because authenticated user access is required.

**Important distinction:** an empty migration journal does not prove all tables are missing. Managed schema synchronization may create tables without journal entries or SQL functions/triggers. The failed audit job is additional evidence that this is not just a cosmetic health-check issue.

**Required next action:** inspect production tables, migration bookkeeping, audit functions/triggers and job outcomes read-only with authorized access, then resolve through the supported migration/publishing process. Verify actual audit protection; do not suppress the 503 to obtain a green status.

## High-priority risks before accepting sensitive data

### H1 — Email delivery is not configured; fallback logs contain message bodies

The production configuration check found no `SENDGRID_API_KEY` or `APP_BASE_URL`, and runtime logs explicitly warn that mail is logged rather than sent. `artifacts/api-server/src/lib/mail/index.ts:41-48` logs full text, including invitation/reset links when those templates are used. Synthetic integration-test output demonstrated this logging behavior.

**Impact:** administrators will not receive new-inquiry notifications, and invitation/password-reset delivery is not operational. Anyone with log access may see sensitive one-time links.

**Action:** configure and verify delivery through the approved integration/secrets process; redact message bodies/tokens from production fallback logs. Confirm verified sender, canonical link URL and successful receipt without exposing personal inquiry content.

### H2 — Bootstrap credentials and provider MFA need hardening

`artifacts/api-server/src/lib/bootstrap.ts` contains a committed default password hash; tests know the matching bootstrap password. Creation sets `mustChangePassword: false`. The production configuration check found no bootstrap-password override or mandatory-provider-MFA setting; MFA enforcement defaults off.

**Impact:** fresh installations can create a privileged account using a known default. This does **not** prove that the existing production account still has that password; no production password was attempted or inspected.

**Action:** eliminate known-default production bootstrap, require secure setup/rotation, verify existing privileged accounts and sessions, and establish MFA/recovery policy. Preserve the owner's separate decision that support windows are opt-in.

### H3 — Lead conversion and legacy import are not concurrency-safe

**Code-level finding, not a reproduced race.** `routes/clients.ts:133-184` reads conversion state before the transaction, inserts a client, then updates the lead without a row lock or conditional “still unconverted” predicate. Two simultaneous conversions without a Medicaid ID can each create a client; the last lead update wins. The only relevant client uniqueness rule is organization + non-null Medicaid ID.

`lib/leads.ts:373-432` selects legacy consultations before per-row transactions, inserts a lead and then deletes the original. Concurrent boots can read the same source row and import it twice because there is no claim/lock or unique source identifier. Sequential import is tested; concurrent import is not. It assigns all legacy rows to the configured default organization, which requires confirmation before migration.

**Action:** make conversion/import atomic under concurrency, preserve an idempotent source reference, and test simultaneous calls/boots. Also protect stage updates racing with conversion.

### H4 — Repeat inquiries can silently discard changed answers

**Confirmed in source and existing test intent.** `routes/public.ts:91-99` treats any same-email submission within the configured window as a duplicate, appends only a timeline event, and returns success without saving the new answers. It does not compare payloads or use a request-id idempotency key.

**Impact:** a corrected message or a second family member's inquiry from the same email can be accepted but lost. The rate-limit count measures newly created leads, so repeated duplicate submissions do not consume that limit; count-then-insert also permits concurrency races.

**Action:** distinguish retries from different submissions, preserve meaningful changed answers, and rate-limit attempts atomically. Existing sequential-duplicate tests currently encode the lossy behavior.

### H5 — Dependency findings need runtime-aware remediation

Scanner totals across active and archived lockfiles: **19 critical, 71 high, 63 moderate, 11 low**. Filtering to the active `pnpm-lock.yaml` gives **12 critical, 27 high, 20 moderate, 6 low** advisory/package-version records. These are not counts of independently exploitable production flaws.

Priority examples:

| Package | Finding / relevance | Scanner-reported fixed version |
|---|---|---|
| body-parser 2.3.0 | High compressed-body denial of service; Express JSON/urlencoded parsing is active | 2.4.0 |
| proxy-addr 2.0.7 | Critical IP-trust advisory; runtime dependency, but advisory's subnet-trust prerequisite is not established with this app's numeric hop trust | 2.0.8 |
| orval 8.18.0 | Eleven critical code-generation injection advisories and a high remote-reference issue; build tool, not a public API handler; untrusted specs are the key threat | 8.21.0 / 8.22.0 |
| zod 3.25.76 | High collection-validation resource consumption; request body size is capped but not a substitute for patching | 4.6.6; major upgrade requires compatibility review |
| vite 7.3.5 | Several advisories; some Windows/editor-specific and not applicable to Linux static production hosting | 7.3.7 |

Other findings affect build/transitive tooling (brace-expansion, browserslist, fast-uri, js-yaml, markdown-it, PostCSS, source-map-js). Upgrade compatible parents first and re-run build/tests; do not blindly force major versions or present archived Next.js advisories as deployed vulnerabilities.

Static scan triage:
- TOTP SHA-1 finding: used inside HMAC for standard TOTP interoperability, not ordinary SHA-1 password hashing; not established as a vulnerability.
- OAuth callback redirect: `safeNext` rejects `//` but not slash-backslash URL normalization. The callback exits immediately under the current forced demo-data mode, so the flagged redirect is not reachable in this build. Harden URL-origin validation before reactivating it.

The privacy scanner reported no issues, but manual inspection still identified full mail-body logging.

## Important operational and usability issues

- **Autoscaling maintenance:** scheduler uses an in-process 15-minute timer (`lib/jobs.ts:394-435`); sleeping instances can miss jobs. No external cron secret was configured in the checked production settings. Verify reliable scheduling and job alerts rather than assuming timers always run.
- **Lead retention:** IP scrubbing exists; no demonstrated end-to-end retention/deletion policy for inquiry answers and contact details. Define legal retention, access and deletion requirements before collecting sensitive material.
- **Inbox truncation:** UI requests 200 rows; API accepts a limit up to 500 but exposes no pagination cursor/offset. Older inquiries can disappear from the default view while counts include them (`leads-inbox.ts:59`, `routes/leads.ts:54-62,239-247`).
- **Maps link:** browser observed the embedded map's “Open in Maps” link resolving to `about:invalid#zClosurez`; verify provider/embed behavior and provide a working direct map fallback.
- **Media feed:** external DLS Media RSS fetch is blocked by CORS in the browser; existing cards remain visible. Live feed freshness is not verified.
- **Validation text:** required warnings remain after correcting fields until another submit; submission validity and failure preservation still work.
- **Bundle size:** portal JS is approximately 979 KB minified / 284 KB gzip; code splitting is an optional performance improvement, not the principal launch blocker.
- **Root build ergonomics:** bare root build fails on the design sandbox's required port environment, while individual production artifact builds pass. Make CI supply required build environment or exclude nonproduction artifacts appropriately.
- **Development exposure:** Vite allows arbitrary hosts and disables filesystem strictness. Do not expose the development server publicly; production uses static assets rather than Vite dev.

## Existing safeguards verified

Current-source integration tests pass for authentication, organization isolation, role/feature access, public validation, rate-limit sequential behavior, client conversion and legacy import. API sessions use random opaque tokens, hashed storage and httpOnly SameSite=Lax cookies; Secure defaults on in production, with expiration/revocation checks. Request logging strips query strings and does not log request bodies. Lead notification templates omit inquiry answers. Public form success requires the expected response body, not merely any successful HTTP status.

Browser checks confirmed public layouts, current service-area words (Greeley, Loveland, Fort Collins), loaded images, validation, and preserved entries after a simulated failure. Static HTML reference inspection found no missing local files after accounting for the valid `/login` application route.

## Historical review reconciliation

The September launch-readiness review describes the pre-migration Next.js/Supabase application. Its old file paths and findings cannot be assumed current. Real identity, feature controls, leads and client creation now exist in the Express/PostgreSQL implementation. The fundamental demo-backed care/billing limitation remains and was independently confirmed.

The earlier consultation-inbox suggestion substantially overlaps the newly merged inbox; do not rebuild it. Its retention/pagination concerns still deserve follow-up. Analytics remains optional and does not block safe launch.

## Unverified boundaries

- Existing production table/function/trigger state, actual privileged-account password/MFA status, backup coverage and a successful restore drill.
- Authenticated UI inbox/editor/conversion, successful real browser submission, and actual email receipt.
- Load/soak testing, simultaneous conversion/import reproduction, external cron execution, disaster recovery, compliance agreements and operational training.
- Full end-to-end certification of every legacy clinical/billing module; demo-backed architecture already prevents a positive full-launch assessment.

No legal/HIPAA certification is implied. Validate vendor agreements, authorized data use, incident response and retention with the responsible operator before real PHI is entered.

## Recommended release gates

1. Choose website/leads-only versus full care-management launch; disable unfinished modules for a restricted launch.
2. Reconcile current code, development schema and production deployment; obtain authorized read-only production inspection.
3. Resolve readiness/audit integrity, credential defaults, mail delivery/logging and applicable dependency findings.
4. Correct concurrent conversion/import and lossy duplicate handling before relying on leads for intake.
5. Verify one complete authorized journey: public submission → inbox → follow-up → client, including configuration edits, failure/retry and permissions.
6. Confirm backups/restore, reliable jobs, monitoring, retention and owner handover; then reassess go/no-go.

**Bottom line:** source changes are intact and automated tests are green. The running deployment and full production workflows are not yet ready.

## Remediation status (added 2026-10-29, same day)

H1, H2 and H5 were addressed on branch `claude/hopeful-pasteur-78y1ky`; the details, the operator steps still required in the deployment, the MFA/recovery policy awaiting the owner's decision, and the dependency triage table are in [2026-10-29-h1-h2-h5-remediation.md](./2026-10-29-h1-h2-h5-remediation.md). In short: the committed default bootstrap password is gone and the setup password is single-use and enforced server-side; the mail fallback logs envelopes only and a delivery test is available from System status; the active lockfile's audit moved from 12 critical / 30 high / 18 moderate / 5 low to 0 / 0 / 1 / 1, with the two remaining findings triaged as build-time only. B1–B3, H3 and H4 are unchanged by that work. H3 and H4 were then addressed in two steps — the row locks, the unique source reference and the attempts ledger first, and the key-plus-answers definition of a retry, the per-email lock and the atomic import audit entry after — recorded with the operator step they require in [2026-10-29-h3-h4-remediation.md](./2026-10-29-h3-h4-remediation.md). The `.html` copy of this audit is a snapshot taken before remediation.
