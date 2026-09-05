# DLS Compliance & Billing System — Launch-Readiness Review

**Audience:** developers. **Date:** 2026-09-05. **Reviewed commit:** `0a4eb49` (branch `claude/dls-system-review-ld6arf`, identical to `main` minus the PR #1 merge commit). Companion document: [`2026-09-roadmap.md`](./2026-09-roadmap.md) (client-facing plan).

## How this review was done

Every client-requested feature was traced end to end — UI → server action or API route → repository layer → demo store **and** Supabase branch → schema/RLS/triggers → external integration — and classified as working, partially built, stubbed, missing, or built-but-disabled. Every finding below cites `file:line` at the reviewed commit and was confirmed by reading the source, not inferred from a route or table existing.

**Sources of intent:** the client's architecture diagram (green check marks = launch set), `docs/design/HANDOFF-README.md`, `DECISIONS.md`, `PRODUCTION-READINESS.md`, the prototype screenshots and the interactive prototype under `docs/design/`. No separate owner-feedback document exists in the repo or on GitHub; if one exists, add it under `docs/` and re-check this review against it.

**Key context:** the build was verified only in **demo mode** (in-memory store). The Supabase branch of the repository layer has never been exercised end to end, which is where most of the launch-blocking defects live.

**Update 2026-09-05 (PR-A):** `lib/db/__tests__/schema.test.ts` now boots an in-process Postgres (pglite) and applies the migrations, policies and seed for real. Doing so confirmed findings #2 and #6 empirically and surfaced two more (#38, #39 below). Findings marked "fixed in 0006" are addressed by `supabase/migrations/0006_real_mode_fixes.sql`.

**Launch set (green check marks):** Intake paperwork · Renewal paperwork (client, yearly) · Incident report (management review) · Core client data · Billing · Notes · Staff data · Relias training · Client attendance records (sample pending) · Person-centered profile (sample pending). Everything else in the codebase (EVV/GPS clock, eMAR, payroll transmittal, recurring scheduling, QA flags, monthly report generation, DVR notices, Sandata) is beyond the launch set and must become Super-Admin-gateable. One implicit dependency the diagram does not show: **notes require a visit and visits require a physician order** (`progress_notes.visit_id` NOT NULL, `fn_visit_requires_active_order`), so the schedule board and physician-order management must ship **on** at launch.

**Roles:** code has `Admin | Scheduler | Field_Staff` (`lib/supabase/types.ts:5`; DB CHECK `supabase/migrations/0001_init.sql:23`). Required: Super Admin (vendor) → Admin/Owner → Employee. Neither a Super Admin tier nor a feature-flag system exists (Part C).

---

## Part A — Critical issues

Severity: **C** blocks launch or corrupts Medicaid/payroll data · **H** must fix before real PHI/claims · **M** fix soon · **L** hygiene.

### A1. Real-mode breakers (the app has never run against Supabase)

| # | Sev | Finding | Where | Consequence |
|---|---|---|---|---|
| 1 | C | **Settings → Add user cannot work in real mode.** The Supabase branch inserts `users` without `id`; `users.id` references `auth.users(id)` with no default; there is no invite call. | `lib/data/repo-core.ts:74-80`, `supabase/migrations/0001_init.sql:20` | The Owner cannot onboard a single employee through the app. Fixed in PR-C (invite-based `createUser`). |
| 2 | C | **Route-record rows never append in real mode.** Upsert uses `onConflict: "source,source_id"` but the only unique index is **partial** (`where source_id is not null`); Postgres cannot infer it without the predicate (error 42P10). Both callers discard the result. | `lib/data/repo-field.ts:523-526`, `supabase/migrations/0004_field_ops.sql:129`, `app/api/sync/route.ts:126-134,163-172` | Every clock-out and NMT trip silently fails to reach the timesheet; payroll shows zero hours; nobody is told. |
| 3 | C | **Naive local timestamps written to `timestamptz`.** New-visit form, "move to next day", recurring generation and manual EVV send `YYYY-MM-DDTHH:MM:00` with no offset; PostgREST stores it as UTC. Demo mode stores the naive string and reads it back as local, so the demo looks right. | `components/admin/schedule-board.tsx:265-266`, `:48-58` + `:153-156`, `lib/data/repo-core.ts:407-408`, `components/admin/manual-adjustment-form.tsx:65-66` | Every scheduled/recurring/adjusted visit lands 6–7 h early in production; "move to next day" drifts by the UTC offset on each click; the physician-order trigger evaluates the wrong agency day. Fixed in PR-B (`lib/time/agency.ts`). |
| 4 | C | **Payroll hours computed from UTC time-of-day.** Clock times are UTC ISO strings from the device; the sync route slices `HH:MM` and the date from them; `hoursBetween` clamps negatives to 0. | `app/api/sync/route.ts:158-168`, `lib/data/repo-field.ts:583-587`, `lib/evv/clock.ts:39,73` | Any Denver visit ending after 5/6 pm posts **0.00 hours** under tomorrow's (possibly next week's) timesheet. Affects demo and real mode. Fixed in PR-B. |
| 5 | C | **New clients can never be scheduled; two rules silently switch off.** Intake hard-codes JC/DH/EI caps to 0 and `residence_gps` to null; nothing in the UI creates a physician order (`createPhysicianOrder` has no caller) while the DB trigger rejects visits without one. Null residence disables the geofence; zero cap disables the weekly-authorization blocker. | `app/admin/clients/actions.ts:42-47`, `lib/data/repo-core.ts:197-210`, `supabase/migrations/0003_scheduling_orders.sql:38-62`, `0002_security_hardening.sql:124`, `lib/billing/readiness.ts:108-109` | Owner adds a client → cannot schedule them → support call on day one. |
| 6 | C | **Medication "Missed" is rejected by RLS in real mode.** The update policy's WITH CHECK requires `administered_by = auth.uid()`; the sync route leaves it null for `Missed`; the 409 is terminal and the queue item is deleted. | `supabase/policies/06_medication_logs.sql:16-18`, `app/api/sync/route.ts:94-96`, `lib/offline/syncEngine.ts:102-111` | Staff cannot record a missed med. (eMAR ships off; fix before it is ever switched on.) |
| 7 | C | **Demo mode can be baked into a production build.** `isDemoMode()` falls back to "Supabase vars absent"; `NEXT_PUBLIC_*` is inlined at build time; `.replit` builds and runs in separate steps; `.env.example` ships `NEXT_PUBLIC_DEMO_MODE=true`. | `lib/demo/mode.ts:10-14`, `.replit:11-12`, `.env.example:9` | A deploy whose build lacks the Supabase vars serves the in-memory store and the password-free role picker as "production". |
| 38 | C | **No GPS clock-in or clock-out can be saved in real mode.** The geofence trigger compares `old.clock_in_gps is distinct from new.clock_in_gps`; `point` has no equality operator, so the trigger body fails to plan and every GPS insert/update for a client with a residence on file errors ("operator does not exist: point = point"). Demo mode mirrors the rule in TypeScript and never hit it. | `supabase/migrations/0002_security_hardening.sql:130,139` | EVV is impossible against Supabase for any client with an address; the sync engine retries, then drops the record. Fixed in 0006. |
| 39 | H | **`supabase/seed.sql` had never run against Postgres.** It fails at the EVV-log inserts because of #38, so the documented staging setup ("run seed.sql") was never possible. | `supabase/seed.sql` (EVV block) | Staging and the parallel billing run were blocked. Fixed by #38; the harness now applies the seed on every test run. |

### A2. Billing correctness (Billing is in the launch set)

| # | Sev | Finding | Where | Consequence |
|---|---|---|---|---|
| 8 | C | **837P file is not wire-valid.** Ends with a doubled terminator (`…IEA*1*nnn~~`) and segments are joined with `~\n` (never stripped). The test normalizes both away (`split("~").map(trim).filter(Boolean)`). | `lib/billing/x12-837p.ts:37,104`, `lib/billing/__tests__/x12-837p.test.ts:23` | Clearinghouse/Gainwell rejects the whole interchange; zero claims paid until fixed. |
| 9 | C | **Weekly-authorization blocker silently stops at scale.** Readiness sums the week from `listNotes({})`, capped at 300 rows with no date filter in Supabase mode. | `lib/billing/readiness.ts:50-51,112-120`, `lib/data/repo-field.ts:163` | After a few months, over-authorization claims export as "Ready" → recoupment. |
| 10 | H | **Notes marked billed before the final file is built; file attach unchecked; no transaction.** | `app/admin/billing/actions.ts:55-73`, `lib/data/repo-business.ts:85-101` | Notes can vanish from the billing queue with an empty ledger file; invisible unbilled revenue. |
| 11 | H | **A note with no EVV evidence is "Ready".** `notesWithoutEvv` is dead code; typed note times are never reconciled with clock times. | `lib/billing/readiness.ts:152-156`, `components/field/note-form.tsx:174-175` | Claims billed for visits with no verified attendance. Make the check conditional on the EVV feature being on. |
| 12 | H | **837P placeholders ship silently.** Defaults `NPI 0000000000`, `TODO STREET ADDRESS`, hard-coded payer name; no validation that env values were set; ISA/GS dates use UTC. | `lib/billing/x12-837p.ts:41-42,82,107-117` | A misconfigured deploy produces a plausible file with an all-zero NPI. |
| 13 | M | Hours→units cap conversion assumes exactly 4 units/hour; with 8-minute rounding real hours can differ. Confirm whether authorizations are in hours or units. | `lib/billing/readiness.ts:121`, `app/admin/reports/page.tsx:44` | Cap enforced in the wrong dimension if unit-based. |
| 14 | M | Rounding rule labeled "CMS 8-minute rule" is a per-line 15-minute unit with 8-minute round-up; TS and SQL agree. Confirm against the HCPF billing manual for the billed codes. | `lib/billing/units.ts:10-19`, `0001_init.sql:114-117` | Unit counts may differ from payer expectation on multi-service days. |

### A3. Data loss in the field app

| # | Sev | Finding | Where | Consequence |
|---|---|---|---|---|
| 15 | C | **Queued writes dropped after ~1 minute of transient failures.** Backoff is constant 5–10 s; after 8 attempts the queue item is deleted; the draft was already deleted at submit. The note stays on the device flagged `synced: 0`, but nothing re-queues it and the rejection list is in-memory only. | `lib/offline/syncEngine.ts:29-30,116-121,135`, `components/field/note-form.tsx:152`, `lib/offline/db.ts:146-169` | A short server outage strands signed progress notes on phones. |
| 16 | H | **Any 401 wipes the device, including unsynced work.** | `lib/offline/syncEngine.ts:95-99`, `lib/offline/wipe.ts` | A revoked/expired refresh token destroys queued notes. |
| 17 | H | Clock-out geofence enforced by the DB but not pre-checked on the device; null residence renders "GPS verified (0 m)". | `lib/evv/clock.ts:67-69`, `components/field/clock-panel.tsx:35-36`, `0002_security_hardening.sql:138-145` | Visits stuck without clock-out; false verification text on an EVV record. |
| 18 | H | Telephony fallback records an accepted EVV clock-in with no verification on any GPS failure (including denied permission); no clock-out path. | `lib/evv/clock.ts:88-113`, `components/field/clock-panel.tsx:73-83` | EVV bypass from anywhere. (EVV ships off until Sandata IVR exists.) |
| 19 | H | `/api/sync` validates only `payload.id`; `staff_id`, `client_id`, `administered_by`, visit status flips and timesheet targets are trusted. RLS is the only backstop in real mode; notes RLS never constrains `client_id`; demo mode has none. | `app/api/sync/route.ts:23-28,94-96,114-117,125`, `supabase/policies/05_progress_notes.sql:9-15` | A field user can write a billable note for any client. |

### A4. HIPAA / access control

| # | Sev | Finding | Where | Consequence |
|---|---|---|---|---|
| 20 | H | **Service worker caches PHI-bearing HTML.** `/field/*` navigations are `cache.put` after fetch; five routes are precached with cookies; `/field/timesheet` renders client names server-side. Only the Sign-out button wipes caches; idle timeout does not. | `public/sw.js:11-18,74-89`, `app/field/timesheet/page.tsx:24-29`, `components/idle-timeout.tsx:21`, `components/field/sign-out-button.tsx:18-20` | Unencrypted PHI in Cache Storage on a lost phone that timed out instead of signing out. Fixed in PR-C (`public/sw.js` allowlist; the field idle timeout wipes local data). |
| 21 | H | **Impersonation start/stop unaudited in real mode** (the audit write exists only in the demo branch). | `lib/auth/impersonation.ts:38-39` vs `:44-76` | An admin can browse charts as another user with no trace unless they mutate something. Fixed in PR-C. |
| 22 | H | **Any Google account self-registers as an Active Field Staff user**, via the service-role client, unaudited. | `app/auth/callback/route.ts:26-39` | Uncontrolled account creation in a PHI system. Fixed in PR-C (invite-only callback). |
| 23 | H | **Schedulers have blanket row UPDATE on `clients`** via PostgREST with the anon key; no app-layer client update exists to enforce columns. | `supabase/policies/02_clients.sql:6-10` | Medicaid ID, diagnoses and authorization caps editable outside the app by a non-admin. Fixed in PR-C (migration 0007 column-guard trigger). |
| 24 | H | **Patient names / Medicaid IDs in URLs.** Roster search is a GET form (`?q=Reyes`). | `app/admin/clients/page.tsx:30-32` | PHI in server logs, browser history, Referer headers. Fixed in PR-C (in-browser roster search). |
| 25 | M | Raw Postgres error strings returned to field devices and logged. | `app/api/sync/route.ts:140-148`, `lib/offline/syncEngine.ts:117` | PHI in client-side logs/toasts. Fixed in PR-C (`lib/api/errors.ts`). |
| 26 | M | `billed_at` bulk update and file attach run as service role → audit rows with `performed_by = NULL`, `impersonating` lost. | `lib/data/repo-business.ts:85-101` | Contradicts `PRODUCTION-READINESS.md:29`. |
| 27 | M | `fn_client_assigned_to_me` = "any visit ever"; Schedulers read all `users` incl. license data; no security headers. | `supabase/policies/00_helpers.sql:20-26`, `01_users.sql:10`, `next.config.js` | Minimum-necessary gaps. Security headers added in PR-C; assignment window and Scheduler `users` read remain (4.10). |
| 28 | M | Idle timeout silently disabled by a bad `NEXT_PUBLIC_SESSION_IDLE_MINUTES`; suspension does not revoke the Supabase session or the impersonation JWT (tracked in `PRODUCTION-READINESS.md:43`). | `components/idle-timeout.tsx:9,16`, `lib/auth/session.ts:78` | Lost-device gaps stay on the list. Idle-timeout parsing fixed in PR-C; session revocation remains (4.8). |

### A5. Silent operations and hygiene

| # | Sev | Finding | Where |
|---|---|---|---|
| 29 | H | Credential-expiry sweep and Relias "nightly" sync have **no scheduler** (no `.replit` cron, no `vercel.json`, no workflow); `CRON_SECRET` undocumented. | `app/api/jobs/credential-expiry/route.ts:9-16`, `lib/integrations/relias.ts:66-77`, `.env.example` |
| 30 | H | Uploaded documents can never be opened (no read/presigned-GET path); PATCH marks "synced" on the client's word; no content-type allowlist or size cap. | `lib/integrations/storage.ts` (PutObject only), `app/api/uploads/route.ts:13-14,64-72` |
| 31 | M | QA "med without EVV" flags every med older than 7 days (21-day visit window vs 45-day med/EVV window). | `lib/qa/flags.ts:33-52` |
| 32 | M | Offboarding drops per-visit reassignment failures (`if (res.ok) moved++`, no else); not atomic; only visits move although the UI promises documentation. | `app/admin/staff/actions.ts:41-52`, `components/admin/staff-row-actions.tsx:115` |
| 33 | M | `submitTimesheet`, `submitPayroll`, `setFieldHome` report success on no-op/failed writes. | `lib/data/repo-field.ts:544-548`, `lib/data/repo-business.ts:137-142`, `app/field/actions.ts:9-13` |
| 34 | M | Sandata submission is fire-and-forget inside a request with no queue/retry/record. | `app/api/sync/route.ts:75,175-185` |
| 35 | M | `listClients` search interpolates raw input into a PostgREST `.or()` filter (a `,` or `)` alters the filter). | `lib/data/repo-core.ts:136` Fixed in PR-A (`listClients` strips filter syntax before interpolating). |
| 36 | L | Deployment: no `sharp` (Next 14 falls back to the slower wasm optimizer with a warning; add `sharp` or `images.unoptimized`); `[[ports]]` hard-codes 3000 while Cloud Run injects `$PORT`; `security_invoker` needs PG15+ (Supabase default; confirm). | `package.json`, `.replit:13-17`, `0002_security_hardening.sql:10` |
| 37 | L | Test coverage: only `units` and `837P` have tests; zero tests for readiness, transmittal, QA flags, sync route, EVV or the repo layer; the 837P test masks its file's fatal bug. | `vitest.config.ts`, `lib/billing/__tests__/` |

---

## Part B — Feature inventory and status

Status key: **Working** · **Partial** · **Stubbed** · **Missing** · **Built-but-disabled** (mocked/unscheduled/gated).

### B1. Launch set

| Feature | Status | What exists (trace) | What is missing |
|---|---|---|---|
| **Core client data** | **Partial** | Roster + search `app/admin/clients/page.tsx`; intake `app/admin/clients/new/page.tsx` → `createClientRecord` (`app/admin/clients/actions.ts:24-53`, zod) → `repo-core.ts:152-171` (both branches) → `clients` (`0001_init.sql:35-53`, `0003:89-95`) → RLS `02_clients.sql`. | No detail page (`app/admin/clients/[id]` absent); no update/deactivate function or action; no physician-order UI; caps/residence hard-coded (A1 #5); no address/phone/guardian/emergency-contact/waiver/status columns; search injection (A5 #35). |
| **Intake paperwork** | **Missing** | Nothing; `documents.kind` has no client-document kind (`0004_field_ops.sql:72`). | Required-document checklist per client, upload/attach, status, signatures. |
| **Renewal paperwork (yearly)** | **Missing** | Expiry *display* only: roster badge (`clients/page.tsx:43,65-67`), dashboard count (`app/admin/page.tsx:31,40`), post-expiry QA flag (`lib/qa/flags.ts:86-101`), physician-order expiry claim blocker (`readiness.ts:130-137`). | No renewal tracking or look-ahead reminders (the sweep covers staff only, `lib/integrations/email.ts:74`); no in-app way to renew a plan or order. |
| **Incident report (management review)** | **Partial** | 4-field form `components/field/incident-form.tsx` → `submitIncident` → `repo-business.ts:221-247` (both branches) → `incidents` (`0005_business.sql:103-119`) → RLS `08_phase0_tables.sql:99-105`; read-only admin list `app/admin/incidents/page.tsx`; reachable from `/field/more`. | `occurred_at` fabricated (`actions.ts:19`); no location/injuries/witnesses/supervisor/external-report/follow-up fields; status `draft|submitted` only, no review workflow or reviewer fields; no admin actions; no notification; not in the offline sync union (`lib/offline/db.ts:18`); no `revalidatePath`. |
| **Billing** | **Partial (defective)** | Readiness engine (8 blockers) → billing screen → `bulkExport837P` (server re-evaluates readiness, good) → payer adapter → `x12-837p.ts` → `claim_exports` ledger with a DB sequence control number (`0005:23,30`). Synthetic fee schedule. | A2 #8–#14; no note viewer from billing; QuickBooks adapter is an honest stub (`payers.ts:91-101`); `listPayerAdapters` unused. |
| **Notes** | **Working (capture) / Missing (oversight)** | Field: note page + `note-form.tsx` (live units, goals, dual signatures, autosave) → `writeLocal` → `/api/sync` → `upsertProgressNote` (`repo-field.ts:194-211`) → `progress_notes` with generated units (`0001:100-131`) → RLS `05_progress_notes.sql`; monthly SLS/DVR composition `lib/reports/monthly.ts`. | No admin note viewer/approval; no amendment model; no post-billing lock (RLS allows updating a billed note); goals hard-coded (`note-form.tsx:39-43`); sync validation is id-only (A3 #19); cross-midnight impossible (`0001:125`). |
| **Staff data** | **Partial** | Staff screen; renewals `app/admin/staff/actions.ts:8-24` → `recordCredentialRenewal` (`repo-core.ts:102-117`); offboarding `:30-56`; user CRUD in Settings; credentials as jsonb on `users` (`0001:27`); expiry sweep `email.ts:59-120`. | Add-user broken in real mode (A1 #1); OAuth self-registration (A4 #22); no password reset; name/email/license not editable from the UI; no credential documents; no hire/termination/contact fields; sweep unscheduled (A5 #29). |
| **Relias training** | **Built-but-disabled** | Adapter `lib/integrations/relias.ts` (mock unless `RELIAS_API_BASE_URL`; API path BAA-gated); sync → `relias_completions` (`0005:82-94`, both branches); admin matrix + run-now; field training page; readiness blocker `readiness.ts:83-99`. | API contract unverified (`relias.ts:55-57`); "SSO" is a plain URL with the staff email in the query (`relias.ts:13-16`); no nightly job; `relias_sync_runs` never written; blocker fires only when a completion/credential already exists (`readiness.ts:95`); seed has no completions. |
| **Client attendance records** | **Missing** | The word does not appear in `app/ lib/ components/ supabase/`. Substitutes: `visits.status`, `evv_logs`, `progress_notes`, monthly SLS per-day table (`monthly.ts:89-99`). | Attendance model, Admin edits, monthly per-client record/export. Client sample outstanding. |
| **Person-centered profile** | **Missing** | 6-row read-only client-info drawer on the field visit (`app/field/visits/[id]/page.tsx:61-76`); per-note `goals_addressed` jsonb (`0001:122`). | Profile sections, a `client_goals` source for the note form, printable profile. Client sample outstanding. |

### B2. Built beyond the launch set (must become Super-Admin-gateable; default off)

| Feature | Status | Notes |
|---|---|---|
| EVV / GPS clock | Partial (defective) | A1 #3–#4, A3 #17–#18; Sandata adapter mock (`evv-aggregator.ts:68-71`). |
| eMAR | Partial (defective) | A1 #6; no QMAP check before administering. |
| Schedule board (needed at launch) / recurring | Partial (defective) | A1 #3; no double-booking check; board renders Mon–Fri only (`schedule-board.tsx:35`) while fetching Mon–Sun; moved visits get regenerated by templates. |
| Payroll transmittal | Partial (defective) | A1 #2, #4; "all notes in?" checks timesheets, not notes (`lib/payroll/transmittal.ts:44-48`); quarter-hour rounding undocumented. |
| QA flags | Partial | A5 #31; resolutions permanent by key. |
| Monthly report generation | Working (format unvalidated) | `PRODUCTION-READINESS.md:59`. |
| Documents & DVR notices | Partial | A5 #30; Google Drive stub. |
| Impersonation | Working (real mode unaudited) | A4 #21; the `sub`-preserving design is sound. |
| Audit trail / settings / permission matrix | Working / cosmetic | Part C. |
| Lost-device (encrypted Dexie, idle timeout, wipe) | Partial | PIN/WebAuthn key-wrap and remote wipe open (`PRODUCTION-READINESS.md:42-43`). |

**What is genuinely good and should be kept:** the impersonation JWT design (`sub` stays the admin; the audit trigger reads the claim), the WITH CHECK re-assertions in `04`/`05`/`06`, `security_invoker` on `v_clients`, signature redaction in the audit trigger, the synchronous-crypto rationale in `lib/offline/crypto.ts`, the `assertBaaGate` tripwire, the self-hosted fonts, the physician-order guardrail (trigger + demo mirror + UI), the server-side re-evaluation of readiness at export, and the `PRODUCTION-READINESS.md` gate itself.

---

## Part C — Feature-flag architecture

### C1. Assessment

There is no feature-flag system, and the nearest thing (menu configuration) cannot be extended into the two-tier model without changing its shape:

1. **Menu configuration is cosmetic.** `menu_config` (`0005_business.sql:65-71`) is read only by `app/admin/layout.tsx:24` and Settings; `navForRole` (`components/admin/nav-config.ts:70-76`) hides sections; no page, action, route or RLS policy consults it. Turn COMPLIANCE off for a Scheduler and `/admin/qa`, `/admin/evv`, `/admin/emar` still render (`requireRole("Admin","Scheduler")`).
2. **It cannot express the Admin tier.** `role check (role in ('Scheduler','Field_Staff'))` (`0005:66`), mirrored in `MenuSchema` (`app/admin/settings/actions.ts:41-44`) and `MenuConfigRow` (`lib/supabase/types.ts:253`). Admin-only-ness is hard-coded (`nav-config.ts:33,43,44,51,52,65`; `SYSTEM: false` forced at `settings/actions.ts:52`).
3. **No Super Admin.** Three-value role enum everywhere (`types.ts:5`, `roles.ts:7`, `0001:23`, `00_helpers.sql:5-17`, zod at `settings/actions.ts:13,33`).
4. **No capability primitive.** `requireRole(...roles)` (`lib/auth/session.ts:124-130`) is the only gate; `PERMISSION_MATRIX` (`lib/rbac/roles.ts:16-36`) is a hard-coded, read-only display that can drift from RLS.
5. `menu_config` has no audit trigger in real mode (`0005:70-71`).

### C2. Required design (smallest change set; copies the existing three-layer pattern: UI pre-check → server action → DB rule)

**Decisions.** Flags are org-wide capabilities; `menu_config` shrinks to per-role menu trimming over the same keys. Effective enabled = `super_admin_enabled AND admin_enabled`. Super Admin is a configuration identity with **no standing PHI access** (`fn_is_admin()` stays `= 'Admin'`); vendor access to PHI happens only inside an Admin-granted, time-boxed, audited support window. Visits are a data primitive, not a feature (gating them would break notes and billing).

| Piece | Change | Copies |
|---|---|---|
| Role | Add `Super_Admin` at every enum site: `types.ts:5`, `roles.ts:7-13`, `0001:23` (0006 re-creates the CHECK), `00_helpers.sql` (+`fn_is_super_admin()`), `01_users.sql:4-7` (Super Admin may bootstrap the first Admin), `settings/actions.ts:13,33` (assignable only by a Super Admin), `user-admin-panel.tsx:32-92`, redirects in `app/page.tsx`, `login/page.tsx:17`, `callback/route.ts:45`, `admin/layout.tsx:21` via one `homePathForRole()`, `session.ts:52,86,133-137` (impersonation only inside the support window), demo picker + dataset + seed. | existing role plumbing |
| Table | `feature_flags(key pk, label, category, description, super_admin_enabled, admin_enabled, admin_configurable, employee_facing, launch_default, sort_order, updated_at)` + `fn_audit_row_change` + `fn_set_updated_at` triggers. Tier constraint is a **BEFORE UPDATE trigger** `fn_feature_flags_guard()` (Admin may change only `admin_enabled`, and only where `super_admin_enabled AND admin_configurable`), raising `FEATURE_TIER_VIOLATION` / `FEATURE_NOT_AVAILABLE`. RLS: all signed-in read; Super Admin all; Admin update (columns limited by the trigger). | `menu_config` DDL, `fn_visit_requires_active_order` trigger style |
| Catalog | `lib/rbac/features.ts` constant (26 keys) shared by nav, Settings and the demo store; 0006 seeds the same rows; a vitest asserts parity. **Launch-on:** `clients.core`, `clients.paperwork`, `clients.attendance`, `clients.profile`, `staff.core`, `staff.credentials`, `schedule.board`, `notes.progress`, `notes.addenda`, `incidents.reporting`, `relias.training`, `billing.claims`, `documents.client_files`, `audit.trail`, `platform.impersonation`, `platform.support_access`. **Off by default:** `schedule.recurring`, `relias.sso`, `documents.dvr_notices`, `reports.monthly`, `payroll.transmittal`, `timesheets.route_record`, `evv.clock`, `evv.aggregator`, `emar.medications`, `field.nmt`, `qa.flags`. `admin_configurable=false` on the spine keys (`clients.core`, `staff.core`, `notes.progress`, `audit.trail`, `platform.impersonation`, `schedule.board`). | — |
| Helper | `requireFeature(key, ...roles)` + per-request memo `isFeatureEnabled(key)` beside `requireRole` in `lib/auth/session.ts`; throws `FEATURE_DISABLED:<key>`; the role check runs first. Applied to every gated page/action/route (~30 sites: all `app/admin/*/page.tsx` and `actions.ts`, `app/field/{incident,emar,training,timesheet,documents}`, `/api/uploads`, `/api/reports/monthly`, `/api/jobs/*`, `lib/evv/manualAdjustment.ts`, `lib/auth/impersonation.ts:28`). `/api/sync` gates per table case and returns **403** (terminal for the sync engine) when off. Settings is never feature-gated (escape hatch). With `evv.clock` off, the visit's `Completed` status is set on note submit instead of clock-out. | `requireRole` |
| Nav | `NavItem.feature?: FeatureKey`; `navForRole(role, enabledFeatures, roleMenu)` filters by tier1∧tier2 first, then per-role trim; Admin no longer sees everything unconditionally; `Super_Admin` gets a platform-only nav (`/admin/platform`: flags, accounts, system settings, config-only audit view). | `nav-config.ts` |
| Settings UI | `feature-flag-panel.tsx` replaces `menu-config-panel.tsx`: Super Admin edits tier 1 + `admin_configurable`; Admin edits tier 2, disabled with "Not included in your plan" / "Locked by your provider". Server actions `saveSuperFlags` (`requireRole("Super_Admin")`) and `saveAdminFlags` (re-validates the tier constraint server-side before writing; `revalidatePath("/admin","layout")`). | `saveMenuConfig` clamp pattern |
| DB-side gate | `fn_feature_enabled(key)` (security definer, stable) added to the **WITH CHECK** (never USING, so history stays readable) of the write policies for gated tables: `evv_logs`, `medication_logs`, `nmt_trips`, `incidents`, `claim_exports`, `payroll_periods`, `recurring_visit_templates`, `qa_resolutions`, `documents`, `timesheets`/`timesheet_entries`. Spine tables (`clients`, `visits`, `progress_notes`, `users`) are gated at the action layer only. | existing WITH CHECK re-assertions in `04`/`05`/`06` |
| Migration | `0006_feature_flags.sql`: role CHECK; table + triggers; catalog seed; `menu_config` role CHECK widened to include `Admin`, new `features jsonb` column back-filled from `sections` (`sections` kept and marked deprecated; drop in a later migration); `app_settings.support_access_until`. | 0005 style |
| Demo parity | `DemoDataset.featureFlags` built from the TS catalog; `store.setFeatureFlags()` mirrors the trigger with identical error codes; `getFeatureFlags`/`setFeatureFlags` in `repo-business.ts` beside menu config. | `store.ts:75-193` rule mirrors |
| Tests | `features.test.ts` (catalog ↔ nav ↔ launch list), `nav.test.ts`, demo guard test, `requireFeature` test, and a psql script in the `PRODUCTION-READINESS.md §5` style (Admin flipping tier 1 → exception; write with feature off → RLS denial; read still succeeds). | existing vitest layout |

**Effort: L (6–7 developer-days)**, dominated by the ~30 gate sites and the Settings rewrite.

---

## Part D — Client-intent gap analysis (launch fundamentals)

| Fundamental | Client intent | What the code does/assumes | Gap to close (roadmap ref) |
|---|---|---|---|
| Renewal paperwork (client, yearly) | Annual cycle generated/tracked per client | Nothing generates or tracks; only expiry badges; no reminders for clients; renewal impossible in-app | Requirement model with 12-month cadence, expiry sweep for Admins, roster/dashboard badges, in-app renewal actions (2.2) |
| Intake paperwork | Intake packet per client | Intake = one 11-field form | Required-document checklist with upload and status; confirm packet contents (2.2, open q. 3) |
| Incident reporting (management review) | Report → management review | Report only; fabricated time; no review states/reviewer/resolution/notification | Fields + `submitted → under_review → closed` workflow + Admin notification + offline capture (2.3) |
| Core client data | Manage clients | Create-only; no edit/deactivate/detail; caps/residence hard-coded; orders unmanageable; no contact/guardian/waiver data | Detail/edit/status + physician-order UI + intake fields + GPS capture (2.1) |
| Billing notes | Notes feed billing | Field capture strong; no admin viewer, no billed-lock, no amendment; goals identical for every client | Note viewer + billed-lock trigger + append-only addenda + per-client goals (2.4) |
| Staff data | Manage employees | Add-user broken in real mode; self-registration open; no password reset; credentials without documents | Invite-based onboarding + invite-only OAuth + password reset (0.5); credential documents + scheduler (2.7) |
| Relias integration | Training-compliance status | Mocked transport, unverified mapping, no scheduler; blocker misses never-trained staff; fake SSO | Contract confirmation + nightly job + sync-run log + guard fix; ship API sync only, SSO off until real SP settings (2.8) |
| Attendance records | Sample pending | No concept | Generic v1 (`attendance_records` auto-sourced from completed visits, Admin edits, monthly export, `metadata` jsonb for the sample's extra columns) (2.5) |
| Person-centered profile | Sample pending | No concept; goals hard-coded | Generic v1 (`client_profiles` + `client_goals` feeding the note form; `sections` jsonb for the client's template) (2.6) |

**Assumptions the code makes that the client never confirmed:** Sun–Sat authorization week but Mon–Sun payroll week; authorizations in hours/week and 4 units/hour; the 8-minute round-up rule; quarter-hour payroll rounding; OT at 40 h/week; one client per visit (no group Day Hab); field staff never edit a submitted note; four universal ISP goals; email verification off; any Google account may sign in; 20-minute idle timeout; 150 m geofence from three independent config sources.

---

## Open questions (answers change the roadmap; none block Phase 0)

1. **Role mapping.** Confirm: add `Super_Admin` above `Admin`; keep `Scheduler` and `Field_Staff` as the two employee roles (or collapse to one Employee role?).
2. **Super Admin and PHI.** Recommended: system configuration, users and flags only; PHI only inside an Admin-granted, time-boxed, audited support window. Confirm.
3. **Intake paperwork** is checked in the diagram but absent from the eight-item list. Treat as launch scope? Which documents form the intake packet and the yearly renewal packet (ISP/service plan, physician order, consents, HRC, other)?
4. **Authorizations and units.** Are weekly authorizations issued in hours or units? Which rounding rule do the billed codes follow under HCPF? Is the authorization week Sun–Sat?
5. **Samples.** When do the attendance record and person-centered profile samples arrive? Ship the generic v1 now, or wait?
6. **Incident review.** Who reviews (Owner only?), required statuses/timelines, and whether county/state reporting must be tracked in-app.
7. **Deployment.** Replit (current config) or Vercel? Decides the cron mechanism and the image-optimizer setting.
8. **Relias.** API credentials and completion payload contract; SSO method (SAML/OIDC vs. deep link).
9. **Schedule at launch.** Confirm the schedule board (visit creation + physician orders) ships on, since notes and billing depend on visits.

Questions 9 and 5 are tracked as backlog items [BL-001](./BACKLOG.md#bl-001) and [BL-002](./BACKLOG.md#bl-002) in [`BACKLOG.md`](./BACKLOG.md) so they stay on the radar independently of this document.
