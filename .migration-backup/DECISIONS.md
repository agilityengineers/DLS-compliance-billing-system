# DLS-CMS — persistent project notes

Product requirements to keep in mind across all work:

- **Impersonation is Admin-only.** The "view as user" / impersonate capability must only be available to the Admin role — never Scheduler or Field Staff. The top-bar Impersonate picker in the prototype is a demo control representing the ADMIN's tool.
- One app, role-based: menus adapt to the signed-in role on both desktop and mobile. Admin can configure which sections each role sees (Settings → Menu configuration).
- Mobile is the primary surface for field staff (they travel); desktop is for review/admin work. Field uploads (photos/documents) sync to Amazon S3 and are visible on desktop.
- Field mobile home is user-selectable: Today's visits (default) or dashboard-style.
- Billing, Payroll, Staff & credentials, and Settings stay Admin-only.
- Visual style: "Duet" theme — plum sidebar/headings (#4A3D63), sage buttons (#5F7161), cream background, Source Serif 4 headings + IBM Plex Sans body. Mascot logo at assets/dls-mascot.png.
- Sidebar: collapsible rail + collapsible sections; CORE (member area) expanded by default, other sections collapsed.
- Relias LMS integration lives under a "Training & Learning" section in every view.
- The dls-cms/ folder holds the Next.js 14 + Supabase starter codebase (separate from the prototype DC).

## Integration & deployment decisions (for Claude Code handoff)

- Email: **SendGrid**. Document storage: **AWS S3 + Google Drive**.
- Deployment path: GitHub repo → **Replit** (dev and production environments).
- Auth: **Google OAuth (Google Sign-In)** + standard email/password login. No email verification — keep simple.
- Billing: build **modular** — will integrate with the client's existing billing system (TBD) and possibly **QuickBooks**. Not enough info to build the integration yet; just clean interfaces.
- EVV: **modular adapter pattern**; Colorado's designated aggregator is **Sandata** (hybrid model: state EVV solution free, or alternate vendor that integrates with Sandata). Build the Sandata integration first but keep the adapter swappable.
- Relias: **full integration** — SSO deep link AND nightly completion sync via API (API is the likely primary path). Build for both.
- Demo/fake data only until HIPAA paperwork (BAAs) is in place.
- **Impersonation requirements must be in the handoff doc**: Admin-only; every action taken while impersonating is audit-logged under the admin's real identity.
- MVP order: field app (clock-in → note → sync) → admin review/QA → billing → payroll/Relias.

## Build decisions (implementation, 2026-07-07 — approved by client)

- **Repo layout**: the Next.js app lives at the repository ROOT (not `dls-cms/`)
  so Replit imports and runs it directly. The design package is preserved at
  `docs/design/` (handoff README, screenshots, interactive prototype).
- **Server-side rule enforcement = DATABASE-LEVEL** (client's accepted
  recommendation): geofence, NMT weekly cap, physician-order requirement, and
  manual-EVV restrictions are Postgres triggers/constraints/RLS, because
  offline-authored writes sync straight into the DB and would bypass
  app-layer checks. The UI pre-checks the same rules for good UX; the DB is
  the authority. What remains before production: PRODUCTION-READINESS.md §5.
- **Lost-device protocol (client's accepted recommendation)**: first release
  ships encrypted IndexedDB + idle session timeout + purge-on-submit; app
  PIN/biometric lock and admin-triggered remote wipe are 🔴 REQUIRED before
  any real-PHI pilot (PRODUCTION-READINESS.md §3).
- **Demo mode is explicit and self-describing**: with no Supabase env (or
  `NEXT_PUBLIC_DEMO_MODE=true`) the app runs on a deterministic in-memory
  synthetic dataset, shows a persistent "DEMO — synthetic data, no PHI"
  banner, and offers a role-picker sign-in. Every demo-only compromise is
  tracked in PRODUCTION-READINESS.md §4 and labeled `DEMO:` in code.
- **Impersonation mechanism**: admin identity is PRESERVED — the impersonation
  token keeps `sub = admin` and adds an `impersonating` claim (signed with
  `SUPABASE_JWT_SECRET`, httpOnly cookie, 1 h expiry). `auth.uid()` therefore
  stays the admin for RLS and the audit trigger; the trigger also records the
  `impersonating` claim (migration 0002). Banner + one-tap exit in both shells.
- **Audit redaction**: signature images are logged as `[signature captured]`
  markers, not base64 bytes (audit table held full PHI blobs otherwise).
- **Fonts self-hosted** via @fontsource (no runtime Google Fonts request —
  offline-safe and no third-party PHI-adjacent traffic).
- **Physician orders are a real table** (`physician_orders`) with an active-
  window trigger on visits; the scaffold's free-text order column is
  deprecated in place.
- **Week basis for authorizations**: Sunday–Saturday in the agency timezone
  (`app_settings.agency_timezone`, default America/Denver), used consistently
  by the NMT cap, weekly-units guardrail, and payroll math.
- **Monthly report exports**: print-optimized HTML + Word-compatible `.doc`
  download (no heavyweight docx dependency); exact state-format fidelity is
  gated on the client supplying the current templates (open question Q6).
