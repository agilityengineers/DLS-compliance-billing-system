# PRODUCTION READINESS — what must happen before DLS-CMS goes live

> **This document is the gate.** DLS-CMS currently ships in **DEMO MODE** with
> synthetic data. Every item below must be checked off — and the demo-only
> compromises listed in §4 must be closed — before the system touches real
> client PHI. Items are grouped by blocking severity.

**Status legend:** 🔴 hard blocker (no PHI until done) · 🟡 required for go-live, staged rollout acceptable · 🔵 operational hardening

> **Sign-off sheet:** every item below is indexed as `R<section>.<n>` in [`docs/review/WORKPLAN.md`](./docs/review/WORKPLAN.md) with an owner, an approver, and a status. Update the status there when you check a box here.

---

## 1. Legal / HIPAA prerequisites — 🔴 all hard blockers

- [ ] 🔴 **BAA executed with Supabase** (database + auth host) — use a HIPAA-eligible plan with the HIPAA add-on.
- [ ] 🔴 **BAA executed with AWS** (S3 field uploads).
- [ ] 🔴 **BAA executed with SendGrid/Twilio** (transactional email), or emails must contain zero PHI.
- [ ] 🔴 **BAA executed with Relias** (staff data crosses the API).
- [ ] 🔴 **Sandata / EVV aggregator agreement** in place (Colorado hybrid model election made: state EVV solution vs. alternate vendor).
- [ ] 🔴 Set `BAA_SIGNED_ALL_VENDORS=true` **only after all of the above**. Integrations check this flag and refuse live operation without it (`lib/integrations/hipaaGate.ts`).
- [ ] 🔴 **`NEXT_PUBLIC_DEMO_MODE=false`** and real Supabase credentials configured. Demo mode must never be enabled in an environment holding PHI (the demo store is unauthenticated-by-design behind its own picker).
- [ ] 🟡 Workforce HIPAA training records current for every user with system access.
- [ ] 🟡 Signed security-risk assessment (SRA) covering this system.

## 2. Identity, access & audit — 🔴 unless noted

- [ ] 🔴 **Google OAuth configured in Supabase Auth** (client ID/secret, redirect `https://<domain>/auth/callback`) and tested; email/password enabled with **email verification OFF** per client decision — revisit this before go-live and document acceptance.
- [ ] 🔴 **`SUPABASE_JWT_SECRET` set** in server env. The Admin impersonation token is signed with it (sub = admin, `impersonating` claim). Without it, impersonation is disabled in real mode (fails closed).
- [ ] 🔴 **Run all migrations + policies + verify RLS** with the three-role test matrix (`supabase/policies/*`). Confirm: Field cannot read unassigned clients; Field cannot write `verification_method='Manual'`; `v_clients` respects RLS (`security_invoker=on`, migration 0002).
- [ ] 🔴 Verify **every admin mutation writes `performed_by`** (no service-role writes recording NULL — see §4.2) and impersonated actions record `impersonating`.
- [ ] 🟡 Access reviews: quarterly user list review; offboarding flow (suspend + reassign) exercised.

## 3. Lost-device protocol — client-approved staged rollout

Per the decision of 2026-07-07, the first field release ships **encrypted local
storage + short session idle timeout**. The remaining items are **required
before any real-PHI pilot** — this is the explicit "put in place before we
continue" list:

- [x] Encrypted IndexedDB at rest (XSalsa20-Poly1305 via tweetnacl — synchronous by design so Dexie transactions/liveQuery stay intact; data key in a separate IDB database) — shipped Phase 1.
- [x] Session idle timeout (default 20 min, `NEXT_PUBLIC_SESSION_IDLE_MINUTES`) — shipped Phase 1.
- [x] Local drafts purged after successful submit; synced queue items purged — shipped Phase 1.
- [ ] 🔴 **App PIN or biometric (WebAuthn) lock** wrapping the local data key (KEK over DEK), so a stolen device — locked or unlocked — still challenges. Today the raw data key sits in its own IndexedDB database: encryption protects exported/backed-up data blobs, **not** an attacker with full same-origin device access. The PIN wrap closes exactly that gap.
- [ ] 🔴 **Remote sign-out / remote wipe**: server-side session revocation (Supabase `auth.admin.signOut`) plus the client wipe hook (`lib/offline/wipe.ts` — runs on sign-out and on the field idle timeout; a 401 from sync no longer wipes, it pauses sync and asks for sign-in so unsynced work survives an expired token; the Admin-triggered per-device wipe is still to build).
- [ ] 🟡 MDM or device policy for agency-owned devices (screen lock enforced, OS updates).
- [ ] 🟡 Document the lost-device runbook: who suspends, who wipes, notification timelines under the breach rule.

## 4. Demo-only compromises that MUST be closed

Things the demo deliberately simplifies. Each is labeled in-code with `DEMO:`.

1. 🔴 **Demo sign-in picker** (`/login` role cards) — remove/disable outside demo mode. It exists so the client can tour all three roles without auth setup.
2. 🔴 **Service-role usage** is limited to four call sites (grep `createServiceClient()`): audit-trail reads across users, the notification job's log, creating an auth account by invite (`createUser` — the profile row is then inserted as the Admin), and impersonation start/stop audit rows (`performed_by` and `impersonating` set explicitly). Google sign-in no longer provisions profiles (invite-only). The claim export runs as the Admin (RLS `claims_admin_all`) so its audit rows carry `performed_by`/`impersonating`. All other admin writes use the user-session client so RLS + audit attribution hold; verify none regressed.
3. 🔴 **Fee schedule contains synthetic rates** (`supabase/seed.sql` marks them). Load the real Colorado Medicaid fee schedule (+ DVR rates) before any claim leaves the building. The 837P generator refuses export when a note's rate is missing — do not weaken that check.
4. 🔴 **837P payer specifics**: submitter/receiver IDs, NPI, taxonomy, and payer-specific loops are placeholders from `.env` — validate against the payer companion guide and test with a clearinghouse validation pass.
5. 🔴 **Sandata adapter is an interface + mock transport.** Wire real credentials, run Sandata certification/UAT, and confirm visit acceptance before relying on EVV compliance.
6. 🔴 **Relias adapter is an interface + mock transport.** Wire the real API (nightly completion sync) and confirm SSO deep-link SP settings with Relias support.
7. 🟡 **Google Drive adapter is a stub** — agency-document sync is demo-only until a service account + folder are configured.
8. 🟡 **Telephony EVV fallback records intent only** — a real IVR provider must post verification tokens before telephony counts as EVV.
9. 🟡 **Monthly report exports are print-optimized HTML/.doc** — validate against the state's current SLS Billing and DVR Monthly Progress formats with the client's actual templates; adjust field order/wording to match exactly.
10. 🟡 **Demo data resets on server restart** (in-memory). This is by design; real mode persists in Supabase.

## 5. Server-enforced business rules — verification checklist

The rules are enforced in **Postgres** (triggers/constraints) so offline-synced
writes cannot bypass them. `npm test` now runs them against an in-process
Postgres (pglite) on every run; before go-live, re-run the same checks against
the staging database (fake data) and confirm each rejection:

- [x] Geofence: EVV insert >150 m from residence → `EVV_GEOFENCE` exception (migration 0002). — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging
- [x] Manual EVV from a field session → RLS denial; without reason → CHECK violation. — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging
- [x] Second open clock-in for a visit → unique-index violation (`uq_evv_open_per_visit`). — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging
- [x] Visit without active physician order → `PHYSICIAN_ORDER_REQUIRED` (migration 0003). — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging
- [x] NMT trip beyond the client's weekly authorization → `NMT_AUTHORIZATION_EXHAUSTED` (migration 0004). — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging
- [x] eMAR `Administered` without `administered_time` → CHECK violation (migration 0001). — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging
- [x] Audit rows appear for every PHI mutation, with signature bytes redacted (migration 0002). — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging
- [x] Unit math: DB generated column and `lib/billing/units.ts` agree (vitest suite green). — verified in pglite by `lib/db/__tests__/schema.test.ts` (2026-09-05); re-run on staging

## 6. Infrastructure & operations — 🟡/🔵

- [ ] 🟡 Environments: **dev / staging / prod** on Replit (three Repls or deployments from this repo), all deployed from `main` — the July Replit branch is an archived preview fork (README → Deployment). PHI only ever in prod. Staging runs `supabase/seed.sql`.
- [ ] 🟡 Secrets in Replit Secrets (never in repo); rotate the service-role key on any suspected exposure.
- [ ] 🟡 Backups: Supabase PITR enabled; restore drill performed once.
- [ ] 🟡 TLS-only access; Supabase network restrictions if available.
- [ ] 🔵 Error monitoring (e.g. Sentry **with PHI scrubbing**) and uptime alerting.
- [ ] 🔵 Log hygiene: no PHI in server logs (`console.error` call sites reviewed).
- [ ] 🔵 Load a lockfile-pinned dependency audit (`npm audit`) into CI; enable Dependabot.

## 7. Data & cutover

- [ ] 🟡 Real client/staff data import plan (from the client's current spreadsheets/forms) with field-level mapping sign-off.
- [ ] 🟡 Credential/training records loaded and verified before the expired-credential claim blocker goes live (it will block claims immediately if data is wrong).
- [ ] 🟡 Parallel-run period: one billing cycle where 837P output is compared against the current manual process before submission.
- [ ] 🔵 Train schedulers/admins on impersonation etiquette: the banner is always visible to the admin; every impersonated action is logged under their identity.

## 8. Open launch decisions — tracked in `docs/review/BACKLOG.md`

Neither item is a code defect; both change what "launch" means and must be closed before go-live.

- [ ] 🟡 **[BL-001](./docs/review/BACKLOG.md#bl-001)** — Ship the schedule board and physician-order management ON at launch. Notes require a visit and visits require an active physician order, so gating the schedule off would stop documentation and billing. Needs the owner's confirmation and the feature-catalog default.
- [ ] 🟡 **[BL-002](./docs/review/BACKLOG.md#bl-002)** — File the written owner feedback, requirement documents, and the attendance/person-centered-profile samples under `docs/requirements/`, then re-check the launch-readiness review and roadmap against them.

---

*Maintained alongside DECISIONS.md. When an item closes, check it here and note
the date + owner. When new demo compromises are introduced, they MUST be added
to §4 with a severity.*
