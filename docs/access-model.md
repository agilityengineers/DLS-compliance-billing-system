# Access model: accounts, hierarchy and the feature switchboard

This is the reference for how people get into the DLS Portal and what each of
them can do. The code that enforces it lives in three places, all reading one
shared catalog:

| Piece | Where | Role |
|---|---|---|
| Roles, feature catalog, permission maths | `lib/features` (`@workspace/features`) | Single source of truth shared by the API and the web app |
| Accounts, sessions, switches, audit log | `artifacts/api-server` + `lib/db` (PostgreSQL) | Enforcement: passwords, cookies, hierarchy, tier rules |
| Screens and menus | `artifacts/dls-cms` | Login page, platform console, Settings, per-page gates |

## The hierarchy

```
Super Admin (provider — Agility Engineers)
└── Organization: Durable Life Skills, Inc.
    ├── Admin (owner — e.g. Lisa Torres)
    ├── Scheduler (office / desktop console)
    └── Field Staff (mobile field app)
```

* **Super Admin** owns the *platform*. It decides which capabilities are
  available to an organization, creates organizations and their Admins, can
  reset any organization user's password, and can open an audited "view as"
  support session. It has **no standing access to client records**: its only
  screen is the platform console.
* **Admin** owns the *organization*. Creates Schedulers, Field Staff and other
  Admins, resets their passwords, suspends them, and decides which of the
  provider-enabled capabilities the organization uses and which employee roles
  get each one. Admins can "view as" their own employees (audited).
* **Scheduler / Field Staff** use what the Admin grants. They cannot manage
  accounts or switches.

Nobody can create or change a role above their own. The rules are in
`canManageRole()` in `lib/features/src/roles.ts` and are re-checked by the API
on every request.

## Two-tier feature switches

Every switchable capability is one entry in `FEATURE_CATALOG`
(`lib/features/src/catalog.ts`). Each has two switches and a set of role grants:

| Tier | Who flips it | Where | Stored in |
|---|---|---|---|
| 1 — *available* | Super Admin | Platform console → Feature switchboard | `platform_features` |
| 2 — *on for the organization* + *roles* | Admin | Settings → Feature access | `org_features` |

A person may use a feature only when **tier 1 AND tier 2 are on AND (they are an
Admin OR their role is granted)**. See `isFeatureEnabledFor()` in
`lib/features/src/permissions.ts`; the unit tests in
`lib/features/__tests__` spell out every rule.

Catalog fields that shape what the switches may do:

* `launchDefault` — available and on from the first boot.
* `adminConfigurable: false` — the "spine": once available it is always on for
  the organization (client records, schedule board, progress notes, staff &
  credentials, audit trail, impersonation) because other launch features depend
  on it. Role grants can still be trimmed.
* `employeeRoles` — the only roles that can ever be granted the feature. Billing,
  payroll and staff/credentials list none, so they stay Admin-only whatever the
  switches say.
* `status` — `ready`, `preview` (built but still being hardened, see
  `docs/review`) or `in_development` (no screens yet; the switch reserves the
  capability so it lights up without a deployment once the screens land).

Every gated screen calls `checkAccess({ feature, roles })`
(`artifacts/dls-cms/src/lib/rbac/access.tsx`); every action calls
`requireFeature(key, ...roles)`; offline field writes are checked in
`lib/offline/field-api.ts`; the API checks `requireFeature()` on its own routes.
Menus simply hide what a person may not use. A switched-off screen shows an
explanation card that says who can turn it on.

## Accounts and sign-in

* Passwords are hashed with scrypt (Node built-in) and verified only by the API
  server. The web app never sees a hash.
* The session is an httpOnly, SameSite=Lax cookie (`dls_session`) whose token is
  stored hashed. Sessions idle out after 12 hours and end after 7 days; both are
  configurable (`SESSION_IDLE_MINUTES`, `SESSION_MAX_DAYS`).
* Ten failed sign-ins per email + address in 15 minutes trigger a cool-down.
* New accounts get either a password typed by the administrator or a generated
  one-time password shown exactly once; the person must choose their own
  password on first sign-in (`/auth/reset`).
* Suspending an account or resetting its password signs it out everywhere.
* There is no email-based self-service reset yet (no mail provider is
  configured). Administrators issue resets.

### The provider account

On first boot the API creates the platform owner from `SUPER_ADMIN_EMAIL`
(default `emailme@clarencewilliams.com`) with the agreed bootstrap password
(committed only as a hash). Set `SUPER_ADMIN_PASSWORD` in the deployment's
secret store to bootstrap with a different one; `SUPER_ADMIN_FORCE_RESET=true`
rotates an existing account to it once. Change the password from the app after
the first sign-in.

## Audit

Every configuration change — sign-ins, switch flips, account changes, password
resets, view-as start/stop — is written to `audit_log` with the **real** actor
and, when applicable, the impersonated user. The platform console shows the
platform-wide log; Settings shows the organization's.

## Demo data vs. real accounts

Accounts, roles and switches are real and persist in PostgreSQL. Client, visit,
billing and payroll records are still the synthetic demo dataset (no PHI) and
reset on restart; the banner says so. Real accounts appear in staff lists next
to the synthetic staff so that Schedules and Staff & credentials keep working
while the domain data moves to the database in later phases.

## Domain

The portal is served from one host (temporarily `dls-portal.agilityengineers.com`,
later `portal.durablelifeskills.com`): the web app at `/` and the API at
`/api`, so the session cookie is first-party and no CORS is needed. Point the
custom domain at the Replit deployment (CNAME) and the cookie settings need no
change. If the API is ever hosted on a different origin, list the web origin in
`CORS_ORIGINS`.
