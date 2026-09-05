# Work plan and sign-off sheet

**This is the one list.** Every item that must be worked on or approved before and after launch is indexed here with an owner, an approver, and a status. Detail lives in the linked documents; **status is updated here**. When an item closes, set its status to `Done` and add the date in the Notes column.

Sources: [launch-readiness review](./2026-09-launch-readiness-review.md) (defects, Part A) · [roadmap](./2026-09-roadmap.md) (engineering phases) · [backlog](./BACKLOG.md) (non-code items) · [`PRODUCTION-READINESS.md`](../../PRODUCTION-READINESS.md) (go-live prerequisites).

**Status values:** `Open` · `In progress` · `Blocked` · `Done`. **Owner** = who does the work. **Approver** = who signs it off; `—` means no approval beyond code review.

**Launch gate.** Launch is approved when every row in sections 1, 2, 3 (Phases 0–3), and 5 is `Done`. Section 4 (Phase 4) and section 6 are post-launch.

---

## 1. Decisions and approvals needed

| ID | Decision | Detail | Approver | Status | Notes |
|---|---|---|---|---|---|
| D-01 | Role mapping: add `Super_Admin` above `Admin`; keep `Scheduler` and `Field_Staff` as the two employee roles | Roadmap q.1 | DLS owner | Open | Recommendation stands unless the owner wants a single Employee role |
| D-02 | Vendor access: Super Admin has no standing PHI access; PHI only inside an Admin-granted, time-boxed, audited support window | Roadmap q.2 | DLS owner | Open | |
| D-03 | Intake paperwork in launch scope; contents of the intake packet and the yearly renewal packet | Roadmap q.3 | DLS owner | Open | Drives roadmap 2.2 |
| D-04 | Authorizations in hours or units; rounding rule under HCPF; authorization week Sun–Sat | Roadmap q.4 | DLS owner | Open | Drives roadmap 3.6 |
| D-05 | Attendance and person-centered-profile samples: build generic v1 now or wait | Roadmap q.5 | DLS owner | Open | Linked to BL-002 |
| D-06 | Incident review: who reviews, statuses and timelines, in-app tracking of county/state reporting | Roadmap q.6 | DLS owner | Open | Drives roadmap 2.3 |
| D-07 | Hosting: Replit or Vercel | Roadmap q.7 | DLS owner + architect | Open | Decides cron mechanism (roadmap 2.7) and image optimizer |
| D-08 | Relias: API credentials, completion payload contract, SSO method | Roadmap q.8 | DLS owner (obtain from Relias) | Open | Blocks roadmap 2.8 |
| D-09 | Schedule board and physician-order management ship ON at launch | Roadmap q.9 · [BL-001](./BACKLOG.md#bl-001) | DLS owner | Open | Notes need visits; visits need physician orders |
| D-10 | Written owner feedback and the two samples supplied and filed | Roadmap q.10 · [BL-002](./BACKLOG.md#bl-002) | DLS owner (supply) · PM (file) | Open | Review Part D re-checked afterwards |
| A-01 | Approve the two-tier feature-flag design | Review Part C2 | Architect | Open | Must precede roadmap 0.3 |
| A-02 | Approve the roadmap sequencing and the must-fix-before-launch tier | Roadmap "The plan" | Architect · DLS owner | Open | |
| A-03 | Approve the feature catalog defaults (what is on at launch, what is off) | Review Part C2 "Catalog" | Architect · DLS owner | Open | Includes D-09 |

## 2. Backlog items (non-code)

| ID | Item | Detail | Owner | Approver | Status | Notes |
|---|---|---|---|---|---|---|
| BL-001 | Ship the schedule board and physician-order management ON at launch | [BACKLOG.md](./BACKLOG.md#bl-001) | Architect | DLS owner | Open | Same decision as D-09 |
| BL-002 | File the written owner feedback and requirement documents; re-check the review against them | [BACKLOG.md](./BACKLOG.md#bl-002) | PM | Architect | Open | Same input as D-10 |

## 3. Engineering work — must fix before launch (roadmap Phases 0–3)

| ID | Item | Fixes (review Part A) | Depends on | Effort | Owner | Approver | Status |
|---|---|---|---|---|---|---|---|
| 0.1 | Time-zone helper and all date/time call sites; demo data emits UTC | #3, #4 | — | 3 d | Dev | Architect | Open |
| 0.2 | `Super_Admin` role at every enum site | — | D-01 | 2 d | Dev | Architect | Open |
| 0.3 | Feature flags: table, guard trigger, `fn_feature_enabled`, RLS, migration 0006, demo parity | — | 0.2, A-01 | 5 d | Dev | Architect | Open |
| 0.4 | `requireFeature` at every gate, nav rewrite, two-tier Settings editor, Super Admin console; `Completed` on note submit when EVV is off | — | 0.3, A-03 | 5 d | Dev | Architect | Open |
| 0.5 | Employee onboarding: invite-based Add User, invite-only Google sign-in, password reset | #1, #22 | — | 2 d | Dev | Architect | Open |
| 0.6 | Real-database breakers: timesheet index and result checks; notes query limit; eMAR "Missed" policy | #2, #9, #6 | — | 2 d | Dev | Architect | Open |
| 0.7 | Demo-mode guard at startup; deployment notes | #7 | — | 0.5 d | Dev | Architect | Open |
| 0.8 | HIPAA blockers: service-worker cache, idle-timeout wipe, impersonation audit, roster search off the URL, Scheduler column guard, error-string mapping, security headers | #20, #21, #23, #24, #25, #27 (headers), #28 (idle) | — | 3 d | Dev | Architect | Open |
| 0.9 | Field data safety: backoff without deletion, durable failure list, keep draft until ack, no wipe on 401, per-table sync validation, notes RLS re-asserts `client_id` | #15, #16, #19 | 0.1 | 3 d | Dev | Architect | Open |
| 1.1 | Launch data model migration 0007 + policies + types + demo/seed parity | #5 (schema part) | 0.1–0.3 | 3 d | Dev | Architect | Open |
| 2.1 | Client records: detail page, edit, status, physician-order UI, authorization fields, residence capture | #5 | 1.1, D-09 | 6 d | Dev | DLS owner | Open |
| 2.2 | Intake and yearly renewal paperwork: requirement types, per-client items, reminders, badges | — | 2.1, D-03 | 5 d | Dev | DLS owner | Open |
| 2.3 | Incident reporting for management review: fields, workflow, notification, offline capture | — | 1.1, 0.9, D-06 | 5 d | Dev | DLS owner | Open |
| 2.4 | Notes oversight: admin viewer, billed lock, addenda, goals from `client_goals` | — | 1.1, 2.6 | 3 d | Dev | DLS owner | Open |
| 2.5 | Attendance records v1 | — | 1.1, D-05 | 3 d | Dev | DLS owner | Open |
| 2.6 | Person-centered profile v1 + goals | — | 1.1, D-05 | 3 d | Dev | DLS owner | Open |
| 2.7 | Staff credential documents; nightly scheduler for expiry jobs; `CRON_SECRET` documented | #29 | 0.5, D-07 | 2 d | Dev | Architect | Open |
| 2.8 | Relias: nightly sync route, sync-run log, readiness guard fix, SSO off until real SP settings | #29 (Relias job) | 0.4, D-08 | 3 d + vendor | Dev | Architect | Open |
| 3.1 | Valid 837P file and a test that proves it; agency-time ISA/GS dates | #8, #12 (dates) | — | 1 d | Dev | Architect | Open |
| 3.2 | Safe export order; checked file attach; explicit attribution on service-role writes | #10, #26 | — | 2 d | Dev | Architect | Open |
| 3.3 | EVV evidence as a blocker when EVV is on, a warning when off | #11 | 0.4 | 1 d | Dev | Architect | Open |
| 3.4 | Refuse export with placeholder NPI/address/tax id | #12 | — | 1 d | Dev | Architect | Open |
| 3.5 | Real fee schedule; clearinghouse validation pass; one parallel billing cycle | — | 3.1–3.4, R4.3 | 1 d + DLS | Dev + DLS billing | DLS owner | Open |
| 3.6 | Weekly caps in the authorization's own unit; readiness tests | #13, #14 | D-04 | 1 d | Dev | Architect | Open |

## 4. Engineering work — post-launch (roadmap Phase 4; switched on per need)

| ID | Item | Fixes (review Part A) | Owner | Approver | Status |
|---|---|---|---|---|---|
| 4.1 | EVV/GPS: clock-out pre-check, telephony IVR gating, Sandata certification and durable submission queue | #17, #18, #34 | Dev | DLS owner | Open |
| 4.2 | eMAR: QMAP credential check before administering | — | Dev | DLS owner | Open |
| 4.3 | Scheduling: double-booking prevention, weekend view, template regeneration after a move | — | Dev | Architect | Open |
| 4.4 | Payroll: "all notes in?" checks notes; rounding policy; manual EVV flows to timesheets | — | Dev | DLS owner | Open |
| 4.5 | QA flag window mismatch and resolution keys | #31 | Dev | Architect | Open |
| 4.6 | Documents: download path, content-type allowlist, size cap, upload verification | #30 | Dev | Architect | Open |
| 4.7 | Monthly report formats validated against the state templates | — | Dev | DLS owner | Open |
| 4.8 | Lost-device completion: PIN/biometric key wrap, remote wipe, session revocation on suspend | #28 (revocation) | Dev | Architect | Open |
| 4.9 | Test coverage: readiness, transmittal, QA flags, sync route, time helper | #37 | Dev | Architect | Open |
| 4.10 | Hygiene: offboarding atomicity, no-op success paths, search injection, `sharp`/ports, assignment time window, Scheduler `users` read | #27 (window), #32, #33, #35, #36 | Dev | Architect | Open |
| 4.11 | Drop `menu_config.sections` one release after migration 0006 | — | Dev | Architect | Open |

## 5. Go-live prerequisites (`PRODUCTION-READINESS.md`)

| ID | Item | Source | Owner | Approver | Status |
|---|---|---|---|---|---|
| R1.1 | BAA executed with Supabase (HIPAA add-on) | §1 | DLS owner | Legal | Open |
| R1.2 | BAA executed with AWS (S3) | §1 | DLS owner | Legal | Open |
| R1.3 | BAA executed with SendGrid/Twilio, or emails carry zero PHI | §1 | DLS owner | Legal | Open |
| R1.4 | BAA executed with Relias | §1 | DLS owner | Legal | Open |
| R1.5 | Sandata / EVV aggregator agreement and hybrid-model election | §1 | DLS owner | Legal | Open |
| R1.6 | `BAA_SIGNED_ALL_VENDORS=true` set only after R1.1–R1.5 | §1 | Dev | Architect | Open |
| R1.7 | `NEXT_PUBLIC_DEMO_MODE=false` with real Supabase credentials, present at build time | §1 | Dev | Architect | Open |
| R1.8 | Workforce HIPAA training current for every user with access | §1 | DLS owner | DLS owner | Open |
| R1.9 | Signed security-risk assessment | §1 | DLS owner | DLS owner | Open |
| R2.1 | Google OAuth configured in Supabase Auth; email/password on with verification off (decision documented) | §2 | Dev | Architect | Open |
| R2.2 | `SUPABASE_JWT_SECRET` set (impersonation fails closed without it) | §2 | Dev | Architect | Open |
| R2.3 | Migrations, policies, and the three-role RLS test matrix run and verified | §2 | Dev | Architect | Open |
| R2.4 | Every admin mutation writes `performed_by`; impersonated actions record `impersonating` | §2 | Dev | Architect | Open |
| R2.5 | Quarterly access reviews; offboarding flow exercised | §2 | DLS owner | DLS owner | Open |
| R3.1 | Encrypted IndexedDB at rest | §3 | Dev | — | Done (Phase 1 build) |
| R3.2 | Session idle timeout | §3 | Dev | — | Done (Phase 1 build) |
| R3.3 | Local drafts purged after submit | §3 | Dev | — | Done (Phase 1 build) |
| R3.4 | App PIN or biometric lock wrapping the local data key | §3 | Dev | Architect | Open (roadmap 4.8; required before the real-PHI pilot) |
| R3.5 | Remote sign-out / remote wipe, admin-triggered per device | §3 | Dev | Architect | Open (roadmap 4.8) |
| R3.6 | MDM or device policy for agency devices | §3 | DLS owner | DLS owner | Open |
| R3.7 | Lost-device runbook documented | §3 | DLS owner + architect | DLS owner | Open |
| R4.1 | Demo sign-in picker disabled outside demo mode (verify after 0.7) | §4.1 | Dev | Architect | Open |
| R4.2 | Service-role usage limited to the documented call sites, each with `performed_by` | §4.2 | Dev | Architect | Open |
| R4.3 | Real Colorado Medicaid and DVR fee schedule loaded | §4.3 | DLS billing | DLS owner | Open |
| R4.4 | 837P payer specifics validated against the companion guide; clearinghouse pass | §4.4 | Dev + DLS billing | Clearinghouse / payer | Open |
| R4.5 | Sandata adapter wired to real credentials; certification/UAT complete | §4.5 | Dev | Sandata | Open (post-launch unless EVV is switched on) |
| R4.6 | Relias adapter wired to the real API; SSO settings confirmed | §4.6 | Dev | Relias | Open (roadmap 2.8) |
| R4.7 | Google Drive adapter configured or left disabled | §4.7 | Dev | Architect | Open (post-launch) |
| R4.8 | Telephony EVV fallback backed by a real IVR provider | §4.8 | Dev | Architect | Open (post-launch) |
| R4.9 | Monthly report exports validated against the state templates | §4.9 | Dev | DLS owner | Open (roadmap 4.7) |
| R4.10 | Demo data resets on server restart (in-memory, by design; real mode persists in Supabase) | §4.10 | — | — | Done (informational) |
| R5.1 | Geofence rejection verified on staging | §5 | Dev | Architect | Open |
| R5.2 | Manual EVV from a field session denied; without reason rejected | §5 | Dev | Architect | Open |
| R5.3 | Second open clock-in rejected | §5 | Dev | Architect | Open |
| R5.4 | Visit without active physician order rejected | §5 | Dev | Architect | Open |
| R5.5 | NMT trip beyond the weekly authorization rejected | §5 | Dev | Architect | Open |
| R5.6 | eMAR `Administered` without a time rejected | §5 | Dev | Architect | Open |
| R5.7 | Audit rows for every PHI mutation, signatures redacted | §5 | Dev | Architect | Open |
| R5.8 | Unit math: DB generated column and `lib/billing/units.ts` agree | §5 | Dev | Architect | Open |
| R6.1 | dev / staging / prod environments; PHI only in prod | §6 | Dev | Architect | Open |
| R6.2 | Secrets in the host's secret store; service-role key rotation plan | §6 | Dev | Architect | Open |
| R6.3 | Backups: point-in-time recovery enabled; restore drill performed | §6 | Dev | Architect | Open |
| R6.4 | TLS-only access; network restrictions where available | §6 | Dev | Architect | Open |
| R6.5 | Error monitoring with PHI scrubbing; uptime alerting | §6 | Dev | Architect | Open |
| R6.6 | Log hygiene: no PHI in server logs | §6 | Dev | Architect | Open |
| R6.7 | Dependency audit in CI; Dependabot enabled | §6 | Dev | Architect | Open |
| R7.1 | Client and staff data import plan with field-level mapping sign-off | §7 | PM + DLS owner | DLS owner | Open |
| R7.2 | Credential and training records loaded and verified before the claim blocker goes live | §7 | DLS owner | DLS owner | Open |
| R7.3 | One parallel billing cycle against the current manual process | §7 | DLS billing | DLS owner | Open (same as 3.5) |
| R7.4 | Schedulers and admins trained on impersonation etiquette | §7 | DLS owner | DLS owner | Open |
| R8.1 | BL-001 closed | §8 | Architect | DLS owner | Open |
| R8.2 | BL-002 closed | §8 | PM | Architect | Open |

## 6. Defect index — where each review finding is fixed

| Review # | Finding (short) | Fixed by |
|---|---|---|
| 1 | Add user broken in real mode | 0.5 |
| 2 | Route-record rows never append in real mode | 0.6 |
| 3 | Naive timestamps written to `timestamptz` | 0.1 |
| 4 | Payroll hours from UTC time-of-day | 0.1 |
| 5 | New clients cannot be scheduled; caps and residence hard-coded | 2.1 (UI), 1.1 (schema) |
| 6 | eMAR "Missed" rejected by RLS | 0.6 |
| 7 | Demo mode can be baked into a production build | 0.7 |
| 8 | 837P not wire-valid | 3.1 |
| 9 | Weekly-authorization check starved by query cap | 0.6 |
| 10 | Notes marked billed before the file exists | 3.2 |
| 11 | Note with no EVV evidence is "Ready" | 3.3 |
| 12 | 837P placeholders ship silently; UTC dates | 3.4, 3.1 |
| 13 | Cap conversion assumes 4 units/hour | 3.6 |
| 14 | Rounding rule to confirm | 3.6 |
| 15 | Sync queue drops writes after 8 attempts | 0.9 |
| 16 | 401 wipes unsynced work | 0.9 |
| 17 | Clock-out geofence not pre-checked; false "verified" text | 4.1 |
| 18 | Telephony fallback unverified | 4.1 |
| 19 | `/api/sync` validates only the id; notes RLS ignores `client_id` | 0.9 |
| 20 | Service worker caches PHI HTML; idle timeout does not wipe | 0.8 |
| 21 | Impersonation unaudited in real mode | 0.8 |
| 22 | Google accounts self-register | 0.5 |
| 23 | Scheduler blanket UPDATE on `clients` | 0.8 |
| 24 | Patient names in URLs | 0.8 |
| 25 | Raw Postgres errors sent to devices | 0.8 |
| 26 | Service-role writes lose attribution | 3.2 |
| 27 | Assignment window, Scheduler `users` read, security headers | 0.8 (headers), 4.10 |
| 28 | Idle-timeout misconfiguration; session revocation | 0.8 (idle), 4.8 |
| 29 | No scheduler for expiry sweep and Relias sync | 2.7, 2.8 |
| 30 | Documents cannot be opened; upload validation | 4.6 |
| 31 | QA med-without-EVV false positives | 4.5 |
| 32 | Offboarding drops failures | 4.10 |
| 33 | No-op writes report success | 4.10 |
| 34 | Sandata fire-and-forget | 4.1 |
| 35 | Search filter injection | 4.10 |
| 36 | `sharp`, ports, PG version | 4.10 |
| 37 | Test coverage | 4.9 |
