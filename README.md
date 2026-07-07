# DLS-CMS — Durable Life Skills Care Management System

HIPAA-oriented care management for an I/DD services provider (SCC, NMT, Job
Coaching, Day Habilitation under OBRA/DVR): a **desktop admin console**
(`/admin/*`) and an **offline-first mobile field PWA** (`/field/*`) in one
role-based Next.js 14 application, styled to the client-approved **"Duet"**
design (plum `#4A3D63` · sage `#5F7161` · cream `#F7F5F1` · Source Serif 4 +
IBM Plex Sans · 108% base text scale).

> ⚠️ **Before any real client data (PHI) touches this system, read
> [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md).** It is the go-live
> gate: BAAs, the remaining lost-device items, demo-mode compromises to
> close, and the server-enforcement verification checklist.

## Quick start (demo mode — zero setup)

```bash
npm install
npm run dev        # http://localhost:3000
```

With no Supabase configured the app boots into **demo mode**: a deterministic
in-memory synthetic dataset (no PHI, resets on restart), a labeled banner, and
a role-picker sign-in:

| Demo user | Role | What to look at |
|---|---|---|
| K. Sandoval | Admin | Full console, impersonation, billing/payroll/settings |
| T. Alvarez | Scheduler | Filtered menu; Billing visible but **locked** |
| Maria Vega | Field Staff | Mobile-first: Today, clock-in, notes, eMAR, timesheet |

The demo enforces the same business rules as production — the demo store
re-implements the database triggers with identical error codes, so geofence
rejections, NMT-cap blocks, and physician-order failures demo truthfully.

### A 5-minute tour

1. Sign in as **K. Sandoval** → dashboard stat cards → QA (3 flag types, resolvable).
2. Billing → blockers ("Missing client signature", "Staff license expired …") → select ready → **Export 837P** (real X12 file, ledgered control number).
3. Payroll → Torres's notes outstanding → submission blocked.
4. **Impersonate → Maria Vega** (banner: actions logged under YOUR identity) → the field app exactly as she sees it → Exit.
5. Sign in as **Maria Vega** on a phone-sized window: Today ↔ Dashboard toggle, visit → Clock In (GPS), NMT "1 of 2 used this week", photo upload → Uploading → Synced, progress note with live unit calc + dual signatures, timesheet → submit → flips payroll.

## Real mode (Supabase)

1. Create a Supabase project; run in order:
   `supabase/migrations/0001…0005` → `supabase/policies/*.sql` → `supabase/seed.sql` (synthetic data).
2. Auth → enable **Email** (no verification) and **Google** (callback `https://<host>/auth/callback`).
3. Copy `.env.example` → `.env.local`; set the Supabase URL/keys, `SUPABASE_JWT_SECRET`
   (required for impersonation), and `NEXT_PUBLIC_DEMO_MODE=false`.
4. `npm run dev`.

## Architecture

```
app/(auth)/login          Google + email/password · demo role picker
app/auth/callback         OAuth code exchange (+ first-run profile)
app/admin/*               Console: dashboard, clients, schedule, staff, QA,
                          EVV review, eMAR oversight, incidents, audit trail,
                          billing (837P), payroll, reports, documents, Relias,
                          settings (users · menu config · permission matrix)
app/field/*               PWA: today/week/visit/note/eMAR/timesheet/more
app/api/sync              THE server enforcement point for offline writes
app/api/field/bootstrap   Hydration payload for offline reads
app/api/uploads           S3-presigned field uploads (Uploading → Synced)
app/api/reports/monthly   State SLS billing note + DVR monthly report (.doc)
app/api/jobs/*            Credential-expiry sweep (SendGrid, 30/14/3-day)

lib/auth                  Session context (real vs effective user), Admin-only
                          impersonation (JWT keeps sub=admin + claim)
lib/data                  Repository layer — demo store ⇄ Supabase; UI never
                          touches a backend directly
lib/offline               Dexie (encrypted at rest), sync queue, wipe, autosave
lib/billing               Units (CMS 8-min rule), readiness engine, payer
                          adapters (837P · QuickBooks stub), X12 generator
lib/evv | lib/qa          GPS/geofence + clock flow · QA flag engine
lib/payroll | lib/reports Transmittal math · monthly report composition
lib/integrations          S3/Drive, SendGrid, Relias, Sandata, HIPAA gate
supabase/                 Schema, TRIGGERS (the business rules), RLS, seed
```

**Server-enforced business rules** (Postgres triggers/constraints — offline
sync cannot bypass them; the demo store mirrors them):
150 m EVV geofence · per-client weekly NMT cap · no visit without an active
physician order · Manual EVV = Admin-only + reason required · eMAR
"Administered" requires a time · claim blockers (credentials, signatures,
per-service weekly authorization) · audit trigger on every PHI mutation with
impersonation attribution and signature redaction.

## Commands

```bash
npm run dev / build / start   # app (binds 0.0.0.0:$PORT for Replit)
npm run lint                  # eslint (next/core-web-vitals)
npm run typecheck             # tsc --noEmit
npm test                      # vitest (billing units + 837P)
```

## Deployment

GitHub → **Replit** (`.replit` included; dev/staging/prod as separate
deployments). Secrets go in Replit Secrets, never the repo. Keep
`NEXT_PUBLIC_DEMO_MODE=true` everywhere until PRODUCTION-READINESS.md §1 is
complete.

## Documents

- [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) — the go-live gate (read first)
- [DECISIONS.md](./DECISIONS.md) — product + build decision log
- `docs/design/` — the design handoff (spec, screenshots, interactive prototype)
