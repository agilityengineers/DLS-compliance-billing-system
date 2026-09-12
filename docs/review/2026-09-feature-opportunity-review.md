# Feature-opportunity review — the DLS prototype vs. this codebase

**Audience:** the DLS owner and the engineering team. **Date:** 2026-09-12.
**Subject:** [`agilityengineers/DLS---Smart-Documentation-and-Billing-Application`](https://github.com/agilityengineers/DLS---Smart-Documentation-and-Billing-Application) at commit `25cdcc9`.
**Companions:** [launch-readiness review](./2026-09-launch-readiness-review.md) · [roadmap](./2026-09-roadmap.md) · [backlog](./BACKLOG.md) · [prototype sources](../reference/dls-prototype/)

This is a curated shortlist of what is worth merging from the prototype, not a
side-by-side matrix of every difference. Two findings frame everything below.

**The prototype has no backend to port.** It is two files — a `README.md` and a
single 2.3 MB `index.html`. Its own README calls it *"a clickable, front-end
prototype … mock data only — no backend, no database, no real
authentication."* The app sources are gzipped inside a `__bundler/manifest`
block; recovered, they are 19 browser-Babel JSX modules wired together with
`window.*` globals and inline styles (see
[`docs/reference/dls-prototype/`](../reference/dls-prototype/)). There are no
routes, no service layer, no integrations and no persisted data models. What is
portable is **design and schema, not code**.

**Both repositories are the same product.** A merge review usually asks whether
the donor's domain logic transfers. Here it does not arise: this repository
*is* the DLS system — `lib/evv/`, `lib/billing/x12-837p.ts`, `lib/billing/units.ts`,
I/DD care management throughout. Nothing in the prototype is off-topic. The
real filter turns out to be **duplication versus genuine gap — and where the
prototype's version is the better-designed one.**

Paths are relative to `artifacts/dls-cms/` unless noted.

---

## Bring it over

### 1. The configurable credentialing requirements registry

**Prototype:** `02-hiring-data.jsx` (`REQUIREMENTS`, `gatingReqsFor`) and
`15-staff-credentialing.jsx` (the `Requirements` screen).

Each requirement is a row carrying `required`, `gating`, `automated`, `vendor`,
`appliesTo[]` and `renews`. Admins toggle Required and Gating in the UI, and
every checklist, activation gate and eligibility calculation reads from that
registry. The prototype states the intent plainly: *"No code changes needed
when policy shifts."*

**Why it is the best thing there.** Ours is hardcoded.
`lib/billing/readiness.ts` checks `staff.license_expiration_date`, then loops
`staff.training_completed`, then separately loops Relias
`courses.filter(c => c.required)` — three bespoke branches, each a code change
when policy moves. `app/admin/staff/page.tsx` re-derives the same logic
independently.

This is the shape the roadmap already asks for twice: Phase 2.2 wants intake
paperwork where *"your actual forms plug in as configuration, not code,"* and
Phase 0.3/0.4 wants a feature switchboard with two switches per row. The
registry is a working model of both.

**Status: implemented.** See [Appendix A](#appendix-a--what-shipped-with-this-review).

### 2. The activation gate with a logged admin override

**Prototype:** `15-staff-credentialing.jsx` — `credSummary()` returns
`{done, total, ready}`; if not ready the account cannot go Active, but an admin
may override with a typed reason that lands in the audit trail.

Our `StaffUser.status` is just `"Active" | "Suspended"` with nothing defining
what earns Active. Today an expired credential blocks the *claim* (in
`readiness.ts`) but never blocks *scheduling* — the problem surfaces at billing
time rather than at assignment time. That is the difference between a smoke
alarm and a sprinkler.

**Port:** small. The audit plumbing already exists (`repo-business.ts`
`listAuditTrail`, `ctx.auditCtx`). Derive readiness from the registry in #1, add
`activated_on` / `overridden` / `override_reason`. Pairs naturally with roadmap
0.5 (invite-based onboarding). **Effort: 1–2 days on top of #1.**

### 3. Authorizations as first-class records

**Prototype:** `01-mock-data.jsx` (`AUTHORIZATIONS`) and
`12-authorizations-clients.jsx` (`authState()`).

Shape: `{ authNo, client, service, waiver, units, used, period, expires,
daysLeft }`, with a three-state health function driving Healthy / Monitor /
Action needed from both burn rate and days remaining.

**Why it matters.** We model authorizations as four columns on the client row —
`authorized_scc_hours_per_week`, `authorized_jc_hours_per_week`,
`authorized_dh_hours_per_week`, `authorized_nmt_trips_per_week`
(`components/admin/client-roster.tsx:45-49`). That supports a weekly cap check
and nothing else. We cannot answer *"how many units are left on
PA-2026-44817"* or *"which authorizations expire in the next 30 days"* —
there is no authorization number, no period, no total and no balance. The
prototype's own denial demo lands on CARC CO-197 (*"units exceed authorized
balance"*), the exact denial our data model cannot predict.

This is roadmap 3.6 and feeds 2.1.

**Decided 2026-09-12 (roadmap open question 4):** authorizations are issued as
**a weekly cap inside a period total** — the only shape that catches both
CO-197 causes.

| Column | Notes |
|---|---|
| `auth_number` | e.g. `PA-2026-44817`; no equivalent today |
| `client_id`, `service_type` | reuse our `VisitType`, not the prototype's Georgia HCPCS |
| `period_start`, `period_end` | drives renewal alerts; replaces the lone `service_plan_end` that `qa/flags.ts` keys its expired-authorization flag on |
| `total_units` | period balance — the new capability |
| `weekly_cap_units` | our existing check, moved off the client row |
| `unit_basis` | `time` \| `count` — `authorized_nmt_trips_per_week` is trips, not hours (`components/field/nmt-panel.tsx:32`), so a units-only model breaks NMT |
| `status` | active / expired / exhausted, derived |

Store `weekly_cap_units` **in units, not hours**. `readiness.ts` currently does
`Math.round(cap * 4)` at check time; moving the conversion to write time takes
a rounding hazard out of the billing path.

Touches: `lib/billing/readiness.ts` (the `AUTH_FIELD` map becomes a record
lookup; keep the per-service-type separation and `agencySundayOf` windowing —
both are better than the prototype, which has no weekly dimension at all);
`lib/qa/flags.ts` (`expired-authorization` moves to `authorization.period_end`
and gains a balance-exhausted sibling — keep the deterministic `flag_key` so
existing `qa_resolutions` rows survive); `components/field/nmt-panel.tsx`;
`components/admin/client-roster.tsx`.

Migration backfills one row per non-zero `authorized_*_per_week` column with
`total_units` null until DLS supplies real PA data. A row with a weekly cap and
no total behaves exactly as today, so the backfill is behaviour-preserving and
can ship before the PA numbers arrive. **Effort: moderate + migration.**

**Risk:** `readiness.ts` gates real claims, and the weekly-cap defect it
documents fixing (summing every visit type against the SCC-only cap) is the
kind that reappears during a rewrite. Extend its tests first.

### 4. Note approval state — draft → submitted → approved/rejected → billed

**Prototype:** `09-review-queue.jsx`. Approve releases to billing; return sends
the note back with a written reason. Each note carries a five-item check strip:
service matches authorization, linked to an active ISP goal, EVV captured,
units within session time, submitted within 24 h.

Our `ProgressNote` (`lib/supabase/types.ts:100-118`) has `billed_at` and
`claim_export_id` and **no review state at all** — a note goes from written
straight to billable with no supervisor in between. Roadmap 2.4 identifies this.

Four of those five checks already exist as computed logic in `readiness.ts` and
`qa/flags.ts`. What is missing is the state column and the screen.

**Port:** add `status`, `reviewed_by`, `review_reason`, `reviewed_at`; a new
admin route in `App.tsx`; render the check strip from existing
`evaluateUnbilledNotes()` output rather than rebuilding it. **Effort: 3–4 days.**

**Risk:** `bulkExport837P` currently exports anything passing readiness.
Introducing an approval gate means notes stop flowing until someone reviews —
sequence it behind a feature switch or billing stalls on day one.

---

## Maybe later

### 5. Hiring pipeline and public careers application

`14-hiring-pipeline.jsx`, `16-careers-form.jsx`, `02-hiring-data.jsx`
(`APPLICANTS`). Genuinely absent here — zero hits for `applicant`, `hiring` or
`careers` — and absent from the roadmap too.

Real capability, and the applicant schema is well considered: education,
employment history with reason-for-leaving, three references, per-day
availability, at-will e-signature, 60-day application expiry. But it needs a
**public unauthenticated write surface**, and today the only public route is
`/login` (`src/App.tsx`). That means new anti-abuse, upload and PII-at-rest
decisions on a system that has not yet closed its Phase 0 privacy items. Its
natural moment is just after #1, because an applicant's credentialing checklist
is the same registry one stage earlier. Keep the field list as a spec; build
after launch.

### 6. The note narrative structure

`08-note-editor.jsx` `generateNarrative()`. Be clear-eyed: this is **not AI**.
It is string templating over a hardcoded `goalProgressClause` lookup keyed to
demo goal ids, plus a fake typewriter effect. The code is worthless to us.

The **four-section structure** is worth taking — SETTING & SERVICE / SESSION
SUMMARY / PROGRESS TOWARD ISP GOALS / RESPONSE & PLAN. `components/field/note-form.tsx`
captures free text plus a goals array with no narrative scaffold, and auditors
read for exactly those four things. Ship it as section prompts: an afternoon,
no schema change, no AI dependency.

### 7. Claim lifecycle status (the concept, not the module)

Our `ClaimExport` ledger records that a batch went out and nothing about what
came back. The prototype's claim shape carries
`status: submitted|accepted|paid|denied`, `paid`, and `denial: {code, text}`.
Adding payer-response state to the ledger is cheap and unlocks denial
reporting. The 835 screen itself belongs below.

---

## Leave it behind

**8. The billing module and EDI preview** (`10-billing.jsx`). The clearest case
of the comparison running our way. Its "837P generation" is a styled `<div>`
printing four fake segments, with `NM1*85*2*DURABLE LIFE SKILLS INC*****XX*1487654321`
hardcoded. Ours (`lib/billing/x12-837p.ts`) emits a real ISA/GS/ST/BHT envelope
with correct HL loop nesting and SE segment counts, documents the `~\n`
wire-format defect it fixed, validates the submitter to refuse all-zero NPIs and
placeholder addresses, and exports through a two-phase ledger
(`app/admin/billing/actions.ts`) so a note is never marked billed without a
stored file. Porting anything here would be a downgrade.

**9. The compliance engine** (`11-compliance.jsx`). `Flags` is a literal array
of four hand-written demo objects. Our `lib/qa/flags.ts` computes flags from
real data across meds, EVV logs, notes, clients and visits, with deterministic
`flag_key`s joining to a resolutions table. *One cheap steal:* the prototype
attaches an action button to each flag that deep-links to the screen that fixes
it (`f.screen`). Our QA table only offers Resolve.

**10. The 835 remittance screen** (`10-billing.jsx` `Remittance`). A card list
over a two-row mock array. There is no 835 parser anywhere in that file. It
shows what the screen should look like and gives us nothing to build it with.

**11. HR-1 Medicaid work-requirement tracking** (`11-compliance.jsx` `WorkReq`).
Georgia rules, flagged as an unverified assumption in the prototype's own UI
copy. We are Colorado. Wrong state, and speculative even for Georgia.

**12. The entire presentation layer.** `window.*` module wiring, in-browser
Babel, inline style objects, the hand-rolled icon set. We have Radix, Tailwind
and 55 UI components. And **no service codes or rates** — the prototype is
H2025/H2014/T2015 on Georgia NOW/COMP waivers through GAMMIS.

---

## Conflicts to plan around

| Conflict | Detail |
|---|---|
| **Role model** | Prototype: DSP / Supervisor / Billing / HR / Admin. Ours: `Admin / Scheduler / Field_Staff` (`lib/rbac/roles.ts`), plus a Super Admin in roadmap 0.2. Map, do not adopt. #4's review queue needs a Supervisor; today that is Admin. **Open.** |
| **Architecture, mid-migration** | `artifacts/dls-cms` is Next.js + Supabase source (`"use server"`, `next/navigation`, `lib/supabase/*`) running under Vite + wouter shims, while the workspace's real target is Drizzle + Express + OpenAPI — still a scaffold. Land every new table in `lib/db/src/schema/` or it gets migrated twice. |
| **Demo-only build** | `artifacts/dls-cms/vite.config.ts` hardcodes `NEXT_PUBLIC_DEMO_MODE: "true"`; `lib/demo/mode.ts` throws if demo mode coexists with production secrets. Anything ported is demo-path only until the real backend lands. |
| **Orphaned tests** | `lib/db/__tests__/harness.ts` reads `supabase/migrations`, `supabase/policies` and `supabase/seed.sql` from the repo root; those moved to `.migration-backup/`. The pglite schema suite cannot run until the paths are restored. |
| **Deployment** | `.replit` is autoscale + pnpm workspace with a `postMerge` hook. `vite.config.ts` hard-throws without `PORT` and `BASE_PATH`; both need setting explicitly on Vercel. Roadmap question 7 gates 0.7. **Open.** |
| **Dependencies** | `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`. Anything new must be ≥24 h old. None of these ports needs a new dependency. |

## Sequence

#1 → #2 (they compound; #2 is nearly free once #1 lands) → #4 → #3. #1 and #2
also produce a working prototype of the Phase 0.3/0.4 switchboard pattern
before the real one is built.

---

## Appendix A — what shipped with this review

Recommendation #1 is implemented; the rest are recommendations only.

| Area | Files |
|---|---|
| Shared engine package | `lib/credentialing/` — types, the pure engine, and the seed registry. Zero dependencies, so the client, the API server and the tests share one definition |
| Database schema | `lib/db/src/schema/requirements.ts`, `lib/db/src/schema/staff-credentials.ts`, `lib/db/migrations/0001_credentialing.sql` |
| Seeding | `lib/db/src/seed/requirements.ts` |
| API | `lib/api-spec/openapi.yaml` (contract) → `artifacts/api-server/src/routes/credentialing.ts` |
| Repository layer | `artifacts/dls-cms/src/lib/data/repo-credentialing.ts` |
| Claim readiness | `artifacts/dls-cms/src/lib/billing/readiness.ts` — three hardcoded checks became one registry pass, evaluated once per staff member |
| Staff screen | `artifacts/dls-cms/src/app/admin/staff/page.tsx` — no longer re-derives credential logic; renders the same engine |
| Admin screen | `artifacts/dls-cms/src/app/admin/requirements/` + `components/admin/requirement-toggles.tsx`, `requirement-verification.tsx` |
| Demo data | `artifacts/dls-cms/src/lib/data/demo/dataset.ts` — registry plus credential evidence for both resolution paths |
| Tests | `lib/credentialing/__tests__/engine.test.ts` (engine), `artifacts/dls-cms/src/lib/billing/__tests__/readiness-credentials.test.ts` (billing regression guard), `lib/db/__tests__/credentialing.test.ts` (migration, constraints and seed against in-process PostgreSQL), `artifacts/api-server/__tests__/credentialing.test.ts` (the registry over HTTP, end to end). `vitest.config.ts` + `pnpm test` — 69 tests |

The engine reads legacy `training_completed[]`, Relias completions and
`license_expiration_date` through each requirement's `source` descriptor, so
existing data keeps working unchanged and **only lapsed or failed credentials
block claims** — exactly as before. `expiring` is a new warning state that does
not block, and a requirement never started does not block either (turning that
on is `blockOnMissing`, roadmap 2.8).

The billing regression guard pins this: against the demo dataset, exactly two
staff members are blocked — Lesley Martinez on a lapsed licence and Celine
Torres on lapsed CPR — which is what the three hardcoded checks produced.
Ray Romero, newly hired with six gating items never started, is outstanding for
activation and blocks no claim. `pnpm test` runs 45 tests across the engine,
that guard, and the existing agency-time suite.

### Persistence

Resolved. The registry persists for real: `0001_credentialing.sql` creates both
tables with the constraints that matter (a gating item must be required; a
`confirmed` row must name a signer and a date; a waiver must carry a person and
a reason), the API server serves and updates them over the generated contract,
and the client's real-mode path calls that API. There is **no silent fallback
to the shipped defaults** any more — quietly serving default policy to an
agency that had edited theirs would mean billing decisions taken against rules
they never set, so a failure surfaces instead.

Re-seeding is safe on a live database: it refreshes what we own (labels,
notes, citations) and never touches what the agency decided (`required`,
`gating`, and any recorded sign-off). That split is pinned by tests.

### Provenance — and what still needs a human

The registry now records **which rule each requirement rests on and how far
that rule has been checked**. A compliance table that cannot cite its own
authority cannot be audited: a developer's guess and counsel's sign-off look
identical once they are rows. `verification_status` keeps them apart —
`confirmed` (a named person read the primary source), `reported` (citation from
secondary sources), `agency_policy` (DLS's own rule, no mandate behind it).

**Nothing ships as `confirmed`.** The citations were gathered from secondary
sources; primary Colorado regulatory sites were unreachable from the build
environment, so no rule text was read directly. The admin screen counts what is
outstanding and carries a sign-off control, so this is a worklist rather than a
comment nobody reads.

Two substantive corrections came out of that research:

- **QMAP does not renew.** CDPHE registration has not required renewal since
  1 July 2017. The first cut of this registry carried a 12-month interval,
  which would have raised a false expiry warning on every QMAP in the agency.
  (A 2025 change re-qualifies QMAPs in assisted-living residences — confirm
  whether it reaches DLS's HCBS settings.)
- **Colorado does not license direct support professionals.** The
  `professional_license` row is kept Required because the agency records a
  licence number per field staff member and has always treated a lapse as a
  claim blocker — it is preserved deliberately, and labelled `agency_policy`
  rather than dressed up as a mandate. Turning it off is DLS's call.

TB screening was added; it was missing entirely.
