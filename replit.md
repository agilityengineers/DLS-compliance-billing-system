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
- Required env: `DATABASE_URL` — Postgres connection string. Optional: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SESSION_IDLE_MINUTES`, `SESSION_MAX_DAYS`, `CORS_ORIGINS` (see `docs/access-model.md`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/features` — roles, the feature catalog and the two-tier permission maths (shared by API + web)
- `lib/credentialing` — the requirements registry types, the pure evaluation engine and the shipped default registry. No dependencies, so the client, the API server and the tests share one definition. Claim readiness and the staff screen both read it — do not re-derive credential logic anywhere else
- `lib/db/src/schema/access.ts` — organizations, users, sessions, platform/org feature switches, audit log; `schema/requirements.ts` + `schema/staff-credentials.ts` — the credentialing registry; migrations in `lib/db/migrations` (drizzle-kit managed, journal included — never hand-write one)
- `lib/api-spec/openapi.yaml` — the API contract and the source of truth. Edit it, then run the codegen above; never hand-edit anything under a `generated/` folder
- `artifacts/api-server/src` — auth (`routes/auth.ts`), provider console (`routes/platform.ts`), organization admin (`routes/org.ts`), credentialing registry (`routes/credentialing.ts`), bootstrap seed (`lib/bootstrap.ts`)
- `artifacts/dls-cms/src/app/(auth)/login` — the front door; `app/admin/platform/*` — the Super Admin console (overview, organizations, accounts, switchboard, adoption, support access, sessions, audit log, system status; panels in `components/admin/platform`, menu in `components/admin/nav-config.ts`); `app/admin/settings` — Admin accounts + feature access; `app/admin/requirements` — the credentialing registry
- `artifacts/dls-cms/src/lib/auth/session.ts` — the one way to resolve who is acting (reads `/api/auth/me`); `lib/rbac/access.tsx` — page gate
- `docs/access-model.md` — the access model reference; `docs/review/` — launch-readiness review, roadmap, work plan, and the Super Admin console review (`2026-09-super-admin-console.md`: what the console covers and what a provider still needs)

## Architecture decisions

- Identity and configuration are real (PostgreSQL via the API server); client/visit/billing records are still the synthetic demo dataset in the browser. Real accounts are merged into staff lists so screens keep working.
- One catalog (`FEATURE_CATALOG`) drives the switchboard, the Settings screen, navigation and every gate; adding a feature is one catalog entry plus a `checkAccess`/`requireFeature` call.
- Effective access = provider switch ∧ organization switch ∧ role grant; Admins always get what is on, employees only what is granted. Spine features cannot be switched off by the organization.
- The Super Admin has no standing PHI access (review decision D-02); support happens through audited "view as".
- Web app and API share one host (`/` and `/api`), so the session is a first-party httpOnly cookie and no CORS is configured.

## Product

- Login page (email + password) with the DLS logo; role-based landing: provider → platform console, Admin/Scheduler → desktop console, Field Staff → field app
- Platform console (Super Admin): overview with an attention list, organizations with a hand-over checklist, cross-organization accounts, feature switchboard (tier 1), feature adoption matrix, support access (audited view-as), active sessions (end one / sign out everywhere), filterable audit log with CSV export, system status (migrations, sign-in policy, configuration warnings)
- Settings: accounts (create/role/suspend/one-time password), feature access per role (tier 2), permission matrix, audit
- Every module (QA, EVV, eMAR, payroll, reports, documents, Relias, incidents, billing …) is gated by its switch

## User preferences

- Owner account: `emailme@clarencewilliams.com` is the Super Admin; Lisa Torres is set up as the DLS Admin by the Super Admin.
- Domain: temporarily `dls-portal.agilityengineers.com`, later `portal.durablelifeskills.com`.

## Gotchas

- Change `lib/db/src/schema` → run `pnpm --filter @workspace/db run generate` and commit the new file under `lib/db/migrations`; the API applies it on boot.
- The bootstrap password only applies when the Super Admin account does not exist yet; use `SUPER_ADMIN_PASSWORD` + `SUPER_ADMIN_FORCE_RESET=true` to rotate it from the environment.
- `NEXT_PUBLIC_AUTH_MODE=demo` (Vite `VITE_AUTH_MODE=demo`) restores the password-free demo role picker for design reviews without the API.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
