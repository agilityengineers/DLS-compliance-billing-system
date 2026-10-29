# DLS Portal (DLS-CMS)

Care management, compliance and billing portal for Durable Life Skills, Inc.: a desktop admin console, an offline-first mobile field app, and a provider-side platform console.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080). On boot it applies `lib/db/migrations`, seeds the feature switches, the default organization and the Super Admin account.
- `pnpm --filter @workspace/dls-cms run dev` — run the web app (needs `PORT`, `BASE_PATH`; forwards `/api` to `API_PROXY_TARGET`, default `http://localhost:8080`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm test` — unit tests (feature rules, credentialing engine) + API and DB integration tests (set `TEST_DATABASE_URL` to a scratch Postgres; skipped otherwise)
- `pnpm --filter @workspace/db run generate` — write a new SQL migration after changing `lib/db/src/schema`
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; `SUPER_ADMIN_PASSWORD` on the first boot only (a strong one-time setup password for the provider account — there is no built-in default; the account must replace it at its first sign-in; remove it afterwards). Optional: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_BREAKGLASS_EMAIL`/`_PASSWORD` (the second provider account), `REQUIRE_MFA_FOR_PLATFORM`, `REQUIRE_SUPPORT_WINDOW`, `SUPPORT_WINDOW_MAX_HOURS`, `AUDIT_RETENTION_YEARS`, `SENDGRID_API_KEY` + `APP_BASE_URL` (mail; without them messages are recorded in the outbox, not sent, and never written to the production log; `MAIL_LOG_BODIES` logs message text in development only), `SCHEDULER_ENABLED`, `CRON_SECRET`, `SESSION_IDLE_MINUTES`, `SESSION_MAX_DAYS`, `CORS_ORIGINS`, `PUBLIC_FORM_ORIGINS` (the public website's origins, allowed on `/api/public` only), `LEAD_MAX_PER_IP` + `LEAD_WINDOW_MINUTES` (website inquiry limiter), `LEAD_IP_RETENTION_DAYS`, `GIT_SHA` (see `docs/access-model.md` and `docs/review/2026-09-platform-hardening.md`)
- `GET /api/healthz` for an uptime monitor (cheap, no database); `GET /api/readyz` for a readiness probe (database + migrations); `POST /api/jobs/:name/run` with `x-cron-secret` for an external scheduler

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/features` — roles, the provider capability model (`platform.ts`), the feature catalog and the two-tier permission maths (shared by API + web)
- `lib/credentialing` — the requirements registry types, the pure evaluation engine and the shipped default registry. No dependencies, so the client, the API server and the tests share one definition. Claim readiness and the staff screen both read it — do not re-derive credential logic anywhere else
- `lib/db/src/schema/access.ts` — organizations (with contract/BAA/lifecycle), users (with TOTP), sessions, platform/org feature switches, audit log (hash-chained); `schema/security.ts` — sign-in attempts, single-use links, support windows, job runs, mail outbox; `schema/requirements.ts` + `schema/staff-credentials.ts` — the credentialing registry; `schema/leads.ts` — lead funnel stages, public-form questions, leads and their timeline; `schema/clients.ts` — the real client record (slim; roadmap 1.1 extends it); `lib/db/src/seed/leads.ts` — the default funnel and form, added to every organization and never overwritten; migrations in `lib/db/migrations` (drizzle-kit managed, journal included — never hand-write one)
- `lib/api-spec/openapi.yaml` — the contract for the credentialing registry (`/requirements`, `/staff-credentials`), consumed through the generated client. Edit it, then run the codegen above; never hand-edit anything under a `generated/` folder. The auth, org, platform, leads and clients routes validate with inline Zod and are called through `lib/api/client.ts` in the web app
- `artifacts/api-server/src` — auth incl. two-factor, invitations and resets (`routes/auth.ts`), provider console (`routes/platform.ts`), organization admin incl. support windows (`routes/org.ts`), the public inquiry form (`routes/public.ts`: no session, per-route CORS from `PUBLIC_FORM_ORIGINS`, honeypot, per-IP limiter), the leads inbox (`routes/leads.ts`, gated on `leads.inbox`), client records and lead conversion (`routes/clients.ts`), credentialing registry (`routes/credentialing.ts`), bootstrap seed (`lib/bootstrap.ts`), lead helpers (`lib/leads.ts`), maintenance jobs (`lib/jobs.ts`), mail (`lib/mail/`), TOTP (`lib/totp.ts`)
- `artifacts/dls-cms/src/app/(auth)/login` — the front door; `app/admin/platform/*` — the Super Admin console (overview, organizations, accounts, switchboard, adoption, support access, sessions, audit log, system status; panels in `components/admin/platform`, menu in `components/admin/nav-config.ts`); `app/admin/settings` — Admin accounts + feature access; `app/admin/requirements` — the credentialing registry
- `artifacts/dls-cms/src/lib/auth/session.ts` — the one way to resolve who is acting (reads `/api/auth/me`); `lib/rbac/access.tsx` — page gate
- `docs/access-model.md` — the access model reference; `docs/review/2026-09-platform-hardening.md` — the security work and what an operator must configure; `docs/review/` — launch-readiness review, roadmap, work plan, and the Super Admin console review (`2026-09-super-admin-console.md`: what the console covers and what a provider still needs)

## Architecture decisions

- Identity and configuration are real (PostgreSQL via the API server), and so are leads and the client records created from them (`clients`); visit/note/billing records are still the synthetic demo dataset in the browser. Real accounts are merged into staff lists, and real clients into the roster, so screens keep working.
- One catalog (`FEATURE_CATALOG`) drives the switchboard, the Settings screen, navigation and every gate; adding a feature is one catalog entry plus a `checkAccess`/`requireFeature` call.
- Effective access = provider switch ∧ organization switch ∧ role grant; Admins always get what is on, employees only what is granted. Spine features cannot be switched off by the organization.
- The Super Admin has no screens of its own into client records; support happens through an audited "view as". Review decision D-02 (an Admin-granted window before each session) was declined by the owner on 2026-09-16 and survives as the opt-in `REQUIRE_SUPPORT_WINDOW` flag, off by default.
- Web app and API share one host (`/` and `/api`), so the session is a first-party httpOnly cookie and no CORS is configured.

## Product

- Login page (email + password) with the DLS logo; role-based landing: provider → platform console, Admin/Scheduler → desktop console, Field Staff → field app
- Platform console (Super Admin and Support): overview with an attention list, organizations with a hand-over checklist, cross-organization accounts, feature switchboard (tier 1), feature adoption matrix, support access (audited view-as), active sessions (end one / sign out everywhere), filterable audit log with CSV export, security (two-factor, provider accounts, support windows, failed sign-ins), system status (migrations, sign-in policy, mail, scheduled jobs, configuration warnings)
- Settings: accounts (create/role/suspend/one-time password), feature access per role (tier 2), permission matrix, audit
- Leads: the public website's contact form (`site/contact.html`, posting to `/api/public/leads`; set `apiBase` in `site/js/config.js`) lands in the organization's inbox; admins move each inquiry through an admin-configurable funnel (New → Contacted → Consultation → Qualified → Converted / Closed by default), assign it to an Admin or Scheduler, keep notes, and convert it into a real client record. Admins edit the form's questions and the funnel's stages at `/admin/leads/form`; the website rebuilds its form from `/api/public/forms/contact` on each page load and keeps its static markup as the fallback. Admins see it when `leads.inbox` is on; Schedulers when granted. Emails about a lead never carry what the person wrote. The form sends a per-form `submissionId`, so a retry of a dropped receipt is folded into the inquiry it repeats while changed answers from the same email become a second, cross-referenced inquiry; the per-address limit counts attempts (`lead_submission_attempts`) under a per-address lock. Converting an inquiry and moving it along the funnel both take the lead's row lock, so simultaneous conversions yield one client (`clients.source_lead_id` is unique) and a stage change can never overwrite a conversion. Rows the earlier storage-only endpoint left in `consultation_requests` are imported once per row under a row lock, and only into the default organization while it is the only one (otherwise set `CONSULTATION_IMPORT_ORG_SLUG`); see `docs/consultation-requests.md`
- Every module (QA, EVV, eMAR, payroll, reports, documents, Relias, incidents, billing …) is gated by its switch

## User preferences

- Owner account: `emailme@clarencewilliams.com` is the Super Admin; Lisa Torres is set up as the DLS Admin by the Super Admin.
- Domain: temporarily `dls-portal.agilityengineers.com`, later `portal.durablelifeskills.com`.

## Gotchas

- Change `lib/db/src/schema` → run `pnpm --filter @workspace/db run generate` and commit the new file under `lib/db/migrations`; the API applies it on boot.
- `SUPER_ADMIN_PASSWORD` is read only when the Super Admin account does not exist yet (or with `SUPER_ADMIN_FORCE_RESET=true`, which rotates it for one restart, ends its sessions and is audited). Either way the value is single-use: a temporary or setup password can reach only `/api/auth/me`, `/api/auth/change-password` and `/api/auth/logout` until it is replaced. `GET /api/readyz` answers `setup_required` while no provider account exists. Tests supply their own setup password; none is committed anywhere.
- Orval 8.45 needs Node ≥ 22.18 to run `codegen` (CI never runs it). `pnpm update` rewrites `pnpm-workspace.yaml` and drops its comments — restore the file and re-apply only the catalog lines you meant to change.
- Migrations only run on boot outside production (Replit Publish copies the development schema), so run the API in the workspace once after pulling a new migration before publishing; `GET /api/readyz` reports what is pending.
- The marketing site is served by the portal artifact at `/` (`artifacts/dls-cms/marketing-site.ts`; the portal lives under `/login`, `/admin` and `/field`), so its form posts same-origin and `site/js/config.js` keeps `apiBase` empty. Only if the site is ever hosted on its own domain: set `apiBase` there and put that origin in `PUBLIC_FORM_ORIGINS`, never in `CORS_ORIGINS` (the former opens only `/api/public` and never sends a cookie; the latter opens every route with credentials).
- `docs/consultation-requests.md` records the storage-only endpoint that PR 26 added and this feature superseded; its stored rows are imported into the inbox at boot and its two tables remain until a later generated migration drops them.
- `NEXT_PUBLIC_AUTH_MODE=demo` (Vite `VITE_AUTH_MODE=demo`) restores the password-free demo role picker for design reviews without the API.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
