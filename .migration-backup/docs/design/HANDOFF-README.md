# Handoff: DLS-CMS — HIPAA-Compliant I/DD Care Management System

**Client**: Durable Life Skills, Inc. (Greeley, CO) — I/DD services provider (SCC, NMT, Job Coaching, Day Habilitation under OBRA/DVR programs).

## Overview

One role-based application with two surfaces: a **desktop admin console** and a **mobile-first field app** (PWA, offline-first). Field staff are the primary users and are traveling most of the time — the mobile app is the main surface; desktop is for review, scheduling, billing, and administration. Field staff may also use the desktop version for their own work (My visits, My timesheet).

This package contains:

1. `prototype/DLS-CMS Prototype.dc.html` — the **interactive design prototype**. Open it in a browser. Top bar controls: Desktop/Mobile device toggle, Impersonate picker (a demo control representing the ADMIN's impersonation tool), offline simulation, and reset. It simulates all flows with fake data and localStorage persistence.
2. `dls-cms/` — a **Next.js 14 + Supabase starter codebase** (TypeScript, Tailwind, App Router) with the schema, RLS policies, offline sync engine, EVV, and billing modules scaffolded. **Build in this codebase**, updating it to match the prototype wherever the two differ (the prototype is newer and wins on UX; the scaffold wins on architecture).
3. `DECISIONS.md` — the running decision log from design sessions.

## About the Design Files

The prototype is a **design reference created in HTML** — it shows intended look and behavior but is not production code. Recreate its screens and flows in the `dls-cms/` Next.js codebase using its established patterns (Tailwind, shadcn-style primitives, Supabase, Dexie offline layer). Do not copy the prototype's markup directly.

## Fidelity

**High-fidelity.** Colors, typography, spacing, copy, and interaction patterns are intentional — recreate closely. Exact tokens below.

## Design Tokens ("Duet" theme)

- Plum (sidebar, headings, accents): `#4A3D63`; accent plum `#6B5A86`; soft plum bg `#EFEAF5`
- Sage (primary buttons/CTAs): `#5F7161`, white text
- Page background (cream): `#F7F5F1`; cards `#FFFFFF`; borders `#E7E3DB`
- Ink `#2B2438`; muted text `#716B80`; sidebar text `#CFC7E0`
- Status pills: success `#E7F0E4`/`#39543A` · warning `#F5EBD8`/`#7A5C22` · danger `#F6E3E0`/`#8C3A2F` · neutral `#EDEBE5`/`#6B665C`
- Clock-out red: `#A94438`
- Typography: **Source Serif 4** (600) for page titles/stat numbers/brand; **IBM Plex Sans** for everything else. Small-caps labels: 10.5px, 700, letter-spacing .1em.
- Radii: cards 12px (desktop) / 14px (mobile), buttons 9–14px, pills 99px
- **Global text scale: 108%** (the client approved "+1 pt" for legibility — bake this into the base font size, don't use CSS zoom in production)
- Mobile tap targets: minimum 44px
- Logo: mascot at `prototype/assets/dls-mascot.png`, circular crop, next to "Durable Life Skills / CARE MANAGEMENT" wordmark

## Roles & Navigation

Three roles: **Admin**, **Scheduler**, **Field Staff**. One app — the menu adapts to the signed-in role on BOTH desktop and mobile.

- **Desktop sidebar**: dark plum, collapsible to a 64px icon rail («/» toggle), sections individually collapsible (▼/▶). Default: CORE expanded, all other sections collapsed. User card pinned at bottom.
- **Mobile**: hamburger (☰) drawer mirroring the role's desktop menu with the same collapsible sections. Field staff additionally get a bottom tab bar (Today · Week · Timesheet · More) for the daily workflow.
- Section structure (Admin): CORE (Dashboard, Clients, Schedule, Staff & credentials) · COMPLIANCE (QA, EVV review, eMAR oversight, Audit trail) · BUSINESS (Billing, Payroll, Reports, Documents & notices) · TRAINING & LEARNING (Relias) · SYSTEM (Settings & users)
- **Admin-configurable menus**: Settings → "Menu configuration (per role)" — checkboxes controlling which sections Scheduler and Field Staff see. Billing, Payroll, Staff & credentials, and Settings are always Admin-only.
- Sections that are desktop-only (wide tables: Billing, Payroll, Schedule grid…) show a "desktop workspace" card on mobile instead of a cramped table.

## Screens (see prototype for exact layouts and copy)

**Desktop — Admin**: Dashboard (4 stat cards + today's visits) · Clients (search + table: name, Medicaid ID, age, diagnoses, authorization, case manager/CCB) · Schedule (staff × weekday grid; visits without a physician order are flagged red and CANNOT be saved — server-enforced) · Staff & credentials (licenses/trainings; expired = claim blocker; "Record renewal") · QA (resolvable inconsistency flags: med log w/o EVV overlap, missing signature, expired ITD authorization) · EVV review (log table + Admin-only manual adjustment that REQUIRES a non-empty reason) · eMAR oversight (agency-wide, status filters) · Audit trail (read-only, grows with every action) · Billing (per-note claim-readiness with named blockers; bulk 837P export) · Payroll transmittal (mirrors the client's real form: per-employee "all notes in?", Wk1/Wk2 hrs + OT, totals, certification checkbox; submission blocked while notes outstanding) · Reports (units delivered vs authorized bars; over-authorization highlighted) · Documents & notices (monthly billing notes, DVR reports, field uploads; "New DVR employment notice" form with the state form's fields) · Relias (agency course table + Launch SSO) · Settings & users (user CRUD, menu configuration, RLS permission matrix).

**Desktop — Scheduler**: filtered menu; Billing visible but locked with an explanation card.

**Desktop — Field Staff**: MY WORK (My visits — week list; My timesheet — route record with submit) + Clients + Documents + Relias.

**Mobile — Field Staff**: Today (home; user-switchable to a dashboard-style home — VISITS IS THE DEFAULT; preference persists per user) · My week · Visit detail (Clock In/Out via GPS; geofence rejection demo; client info; NMT trip logging with 2-trips/week authorization guardrail; **photo/document upload → S3** with "Uploading → Synced" states) · Progress note (continuous scroll: service time with live unit calc, goals checklist, narrative, cancellation reason, DVR supported-employment panel for job-coaching visits with auth #/milestone/cumulative hours, dual signatures required to submit, auto-save) · eMAR (Administered/Refused/Missed) · Timesheet (route record: codes SCC/JC/DH/T; rows append from clock-outs and trips; submit → flips payroll "notes in") · Training (credentials + Relias courses) · More.

**Mobile — Admin/Scheduler**: compact card versions of Dashboard, Clients, QA, eMAR oversight, Audit trail, Documents, Relias.

## Business Rules (must be server-enforced, not just UI)

1. **Billing units**: 15 min = 1 unit, CMS 8-minute rounding (floor(min/15) + 1 if remainder ≥ 8). Implemented in `dls-cms/lib/billing/units.ts` + generated DB column.
2. **Claim blockers** (`canGenerateClaim`): expired staff license or required training · missing client OR caregiver signature · cumulative weekly units exceed authorization.
3. **Scheduling**: no visit may be saved without an active physician order.
4. **EVV**: GPS clock-in/out with 150m geofence; telephony fallback; manual adjustment is Admin-only and requires a documented reason (DB CHECK).
5. **NMT trips**: counted against per-client weekly authorization; block when exhausted.
6. **eMAR**: "Administered" requires an administered_time; all actions audit-logged.
7. **Audit trail**: every PHI mutation logged automatically (DB trigger in scaffold).

## ⚠ Impersonation Requirements (client priority)

- Impersonation ("view as user") is **available to the Admin role ONLY**. Scheduler and Field Staff must never see it.
- While impersonating, the UI shows exactly what the target user sees (menus, data scope) — used to debug UX and improve the end-user experience.
- **Every action performed while impersonating is audit-logged under the ADMIN's real identity**, with the impersonated user recorded (e.g. `performed_by: admin_id, impersonating: user_id`).
- A visible banner must indicate active impersonation, with one-tap exit.

## Integrations & Deployment

- **Auth**: Google OAuth (Google Sign-In) + standard email/password. No email verification. Supabase Auth supports both.
- **Email**: SendGrid. First transactional emails: credential-expiry warnings ("your QMAP expires in 30 days"), then visit/med reminders.
- **Document storage**: AWS S3 (field uploads: photos/documents from visits, synced and visible on desktop Documents) + Google Drive integration for agency documents.
- **EVV**: **modular adapter pattern**. Colorado's designated aggregator is **Sandata** (hybrid model: free state EVV solution, or an alternate vendor that integrates with Sandata). Build the Sandata adapter first; keep the interface swappable.
- **Relias LMS**: full integration — SSO deep link AND nightly completion-sync via the Relias API (API is the primary path). Completions update Staff & credentials; overdue required courses become claim blockers.
- **Billing system**: TBD (client's existing system; possibly QuickBooks). Build modular interfaces only — do not build the integration yet. The 837P generator in `lib/billing/x12-837p.ts` has correct segment structure with payer-specific TODOs.
- **Deployment**: GitHub → **Replit** (dev + production environments). Provide a synthetic seed script; PHI never enters dev.
- **HIPAA**: demo/fake data ONLY until BAAs are executed (Supabase, AWS, Relias).

## Additional Requirements (agreed with client)

1. **Monthly report generation** — compose the state's monthly documents automatically from daily entries: the SCC+NMT "State SLS Billing" note (dated narratives, billable hours/units, NMT trip count, cancellations) and the DVR Monthly Progress Report (service rows: type/hrs/date/narrative, milestone, cumulative hours). Export as Word/PDF matching the state formats. This replaces the client's current manual compilation work.
2. **Lost-device protocol** — encrypted local storage, app PIN/biometric lock, short session timeout, remote sign-out/wipe.
3. **Recurring visits** — weekly recurrence templates in scheduling, with per-instance overrides.
4. **Staff offboarding** — suspend + reassign caseload and open documentation in one flow.
5. **Incident reporting** — mandatory abuse/neglect & critical-incident report workflow (stub acceptable in MVP).
6. **Timezone/DST** — all EVV timestamps stored UTC; unit calculations DST-safe.
7. **Credential-expiry notifications** — SendGrid, 30/14/3-day warnings.
8. **Environments & seed data** — dev/staging/prod on Replit, deterministic synthetic seed script.

## MVP Order

1. Field app core: Google/email login → today's visits → GPS clock-in → progress note with signatures → offline sync
2. Admin review: dashboard, clients, schedule (with physician-order guardrail), QA queue, EVV review
3. Billing: claim readiness + blockers, 837P export (modular payer interface)
4. Payroll transmittal + Relias integration + monthly report generation

## Files

- `screenshots/` — reference captures of the key screens (see `screenshots/INDEX.md`) — match these as closely as possible
- `prototype/DLS-CMS Prototype.dc.html` — open in a browser (keep `support.js`, `ios-frame.jsx`, `assets/` beside it)
- `dls-cms/README.md` — codebase setup (Supabase bootstrap, migrations, RLS, tests)
- `dls-cms/supabase/migrations/0001_init.sql` — full schema incl. audit triggers
- `dls-cms/supabase/policies/*.sql` — RLS per role (add impersonation audit fields when implementing)
- `dls-cms/lib/{offline,evv,billing,rbac}/` — sync engine, GPS/geofence, units/claims/837P (with tests), role checks
- `DECISIONS.md` — decision log

**Note for implementation**: the scaffold predates some decisions (Duet theme, menu configuration, impersonation, Relias, S3 uploads, payroll module, Google OAuth). Where scaffold and this README/prototype disagree, this README and the prototype win.
