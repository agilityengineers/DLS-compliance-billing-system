# PRODUCTION READINESS — what must happen before DLS-CMS goes live

> **This document is the gate.** DLS-CMS currently ships in **DEMO MODE** with
> synthetic data. Every item below must be checked off — and the demo-only
> compromises listed in §4 must be closed — before the system touches real
> client PHI. Items are grouped by blocking severity.

**Status legend:** 🔴 hard blocker (no PHI until done) · 🟡 required for go-live, staged rollout acceptable · 🔵 operational hardening

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

- [x] Encrypted IndexedDB at rest (AES-GCM via WebCrypto; non-extractable key) — shipped Phase 1.
- [x] Session idle timeout (default 20 min, `NEXT_PUBLIC_SESSION_IDLE_MINUTES`) — shipped Phase 1.
- [x] Local drafts purged after successful submit; synced queue items purged — shipped Phase 1.
- [ ] 🔴 **App PIN or biometric (WebAuthn) lock** wrapping the local encryption key, so a stolen unlocked device still challenges. The current non-extractable key protects against disk extraction, **not** against someone holding the unlocked phone.
- [ ] 🔴 **Remote sign-out / remote wipe**: server-side session revocation (Supabase `auth.admin.signOut`) plus the client wipe hook (`lib/offline/wipe.ts` — triggered today on 401; must also be triggerable per-device by an Admin).
- [ ] 🟡 MDM or device policy for agency-owned devices (screen lock enforced, OS updates).
- [ ] 🟡 Document the lost-device runbook: who suspends, who wipes, notification timelines under the breach rule.

## 4. Demo-only compromises that MUST be closed

Things the demo deliberately simplifies. Each is labeled in-code with `DEMO:`.

1. 🔴 **Demo sign-in picker** (`/login` role cards) — remove/disable outside demo mode. It exists so the client can tour all three roles without auth setup.
2. 🔴 **Service-role usage in admin server actions** is limited to: audit queries, claim export, payroll snapshot, notification job. Each call site sets explicit `performed_by`; verify none regressed. All other admin writes use the user-session client so RLS + audit attribution hold.
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
writes cannot bypass them. Before go-live, run the verification suite against a
staging database (fake data) and confirm each rejection:

- [ ] Geofence: EVV insert >150 m from residence → `EVV_GEOFENCE` exception (migration 0002).
- [ ] Manual EVV from a field session → RLS denial; without reason → CHECK violation.
- [ ] Second open clock-in for a visit → unique-index violation (`uq_evv_open_per_visit`).
- [ ] Visit without active physician order → `PHYSICIAN_ORDER_REQUIRED` (migration 0003).
- [ ] NMT trip beyond the client's weekly authorization → `NMT_AUTHORIZATION_EXHAUSTED` (migration 0004).
- [ ] eMAR `Administered` without `administered_time` → CHECK violation (migration 0001).
- [ ] Audit rows appear for every PHI mutation, with signature bytes redacted (migration 0002).
- [ ] Unit math: DB generated column and `lib/billing/units.ts` agree (vitest suite green).

## 6. Infrastructure & operations — 🟡/🔵

- [ ] 🟡 Environments: **dev / staging / prod** on Replit (three Repls or deployments from this repo). PHI only ever in prod. Staging runs `supabase/seed.sql`.
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

---

*Maintained alongside DECISIONS.md. When an item closes, check it here and note
the date + owner. When new demo compromises are introduced, they MUST be added
to §4 with a severity.*
