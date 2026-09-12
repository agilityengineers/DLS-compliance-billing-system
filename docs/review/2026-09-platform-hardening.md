# Platform hardening: the eight gaps, closed

**Audience:** the platform owner, and the operator who runs the deployment. **Date:** 2026-09-12.
**Follows:** [Super Admin console review](./2026-09-super-admin-console.md), which listed these as "what you are not yet thinking about".

## What changed, in one page

The console review ended with a ranked list of things the platform could not do. All eight are now built. The short version, in the same order the review used:

| # | The gap | What exists now |
|---|---|---|
| 1 | One lost password locks you out of your own platform | A **break-glass provider account** created from the deployment's own secrets, and **two-factor sign-in** (TOTP) for any account, which the deployment can require of provider accounts |
| 2 | The support window was a promise, not a rule | An organization's Admin **grants a time-boxed window** before anyone from the provider can view as their people. Without one the API refuses the session |
| 3 | Failed sign-ins left no trace | Every attempt is **recorded**; failures against a real account are audited; the lock-out counter now lives in the database, so it survives restarts and works across instances |
| 4 | No audit retention rule, no tamper evidence | Each entry carries the **hash of the one before it**; the database refuses updates and deletes outright; a **Verify the chain** button and a nightly job say whether anything slipped past; the retention period is configured and displayed |
| 5 | Organizations had a start but no middle or end | **Contract and contact details**, a recorded **Business Associate Agreement** with expiry warnings, a full **export**, and a **decommission** flow |
| 6 | Passwords were handed over by hand | **Invitation and reset links** by email, a **"forgot password"** flow, and a mailer that records and logs every message when no provider is configured, so nothing is lost while the BAA is pending |
| 7 | Nothing ran on a clock, nothing watched the service | A **maintenance scheduler** with seven jobs and a visible history, a **cron endpoint** for hosts that sleep idle instances, and a **readiness endpoint** for an uptime monitor |
| 8 | Every provider operator was a Super Admin | A **Support role** that reads the console and works an incident but changes no configuration and creates no accounts |

Nothing about the two-tier feature switchboard changed, and no provider role has gained access to client records. The opposite: the one route in is now gated on a window the organization controls.

## The mental model, updated

The building-manager analogy from the console review still holds, with three additions.

**The master key now has a spare, kept off-site.** The break-glass account exists only if the deployment sets its email and password, and no screen can create, change or recover it. That is deliberate: a spare key kept in the building is not a spare key.

**Both keys now need a second thing to turn them.** Two-factor sign-in adds a code from an authenticator app. The code and the password fail independently, so losing one does not lose the account.

**And the tenant now controls their own door.** The provider cannot let itself in. It can knock — there is a "request access" button that emails the organization's administrators — but the door opens from the inside, for a stated reason, and closes itself.

## What an operator has to do

Three things are configuration, not code. None of them is required for the system to run; each closes a gap that is otherwise left open, and the System status screen says which are outstanding.

### 1. Create the break-glass account

Set these in the deployment's secret store and restart:

```
SUPER_ADMIN_BREAKGLASS_EMAIL=breakglass@agilityengineers.com
SUPER_ADMIN_BREAKGLASS_PASSWORD=<a long random password>
SUPER_ADMIN_BREAKGLASS_NAME=Break-glass provider account
```

The account is created on the next boot and never again touched. Store the password where the primary account's holder cannot lose both — a password manager belonging to someone else, or a sealed envelope. System status reports whether it is configured.

### 2. Turn on two-factor sign-in

Every account can enrol from **Security** (provider) or **Settings → Your sign-in** (organization Admin). Enrolment shows a key to type into an authenticator app, then asks for one code to prove it worked, then shows ten single-use recovery codes.

Once the provider accounts have enrolled, set `REQUIRE_MFA_FOR_PLATFORM=true`. From then on a provider account that has not enrolled can sign in and enrol but can do nothing else — deliberately, so nobody is locked out of the screen that would let them comply.

### 3. Drive the scheduled work

The API server runs its own timer every `SCHEDULER_INTERVAL_MINUTES` (default 15) and each job decides whether it is due. On a host that sleeps idle instances that is not enough, so the same jobs can be driven from outside:

```
CRON_SECRET=<a long random secret>
```

```sh
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<host>/api/jobs/all/run
```

A GitHub Actions schedule or the host's own cron is enough. Both paths claim the run through the same table, so whichever arrives first does the work and the other stands down. Set `SCHEDULER_ENABLED=false` when an external cron is driving them.

Point an uptime monitor at `GET /api/healthz` (cheap, no database) and a readiness probe at `GET /api/readyz` (checks the database and that migrations are applied).

### Mail, when the BAA is signed

Until `SENDGRID_API_KEY` is set, invitations and reset links are recorded in the outbox and written to the log rather than sent, and the on-screen one-time password remains as the fallback. Nothing is silently dropped. When the agreement is in place:

```
SENDGRID_API_KEY=<key with Mail Send scope only>
APP_BASE_URL=https://dls-portal.agilityengineers.com
MAIL_FROM_DOMAIN=durablelifeskills.com
```

Every template shipped is marked as carrying no client information, following the "bank alert" rule in [the sender assessment](./email-senders.md): the message says what kind of thing happened and links into the portal. A template marked as carrying PHI is refused until `BAA_SIGNED_ALL_VENDORS=true`, and the refusal is recorded rather than thrown.

### The full list of new settings

| Setting | Default | What it does |
|---|---|---|
| `SUPER_ADMIN_BREAKGLASS_EMAIL` / `_PASSWORD` / `_NAME` | unset | The second provider account |
| `REQUIRE_MFA_FOR_PLATFORM` | `false` | Provider accounts must enrol a second factor |
| `MFA_ISSUER` | `DLS Portal` | The name shown in the authenticator app |
| `MFA_PENDING_TTL_MINUTES` | `10` | How long the half-finished sign-in stays valid |
| `SUPPORT_WINDOW_MAX_HOURS` | `8` | Longest window an Admin may grant at once |
| `AUDIT_RETENTION_YEARS` | `6` | Reported on System status; matches the HIPAA documentation rule |
| `LOGIN_ATTEMPT_RETENTION_DAYS` | `90` | How long sign-in attempts are kept |
| `INVITE_TTL_HOURS` / `RESET_TTL_MINUTES` | `168` / `60` | Link lifetimes |
| `SENDGRID_API_KEY`, `MAIL_FROM_DOMAIN`, `SENDGRID_SANDBOX`, `MAIL_REDIRECT_ALL_TO` | unset / `durablelifeskills.com` | Mail |
| `APP_BASE_URL` | unset | Where links in email point |
| `SCHEDULER_ENABLED` / `SCHEDULER_INTERVAL_MINUTES` | `true` / `15` | The in-process timer |
| `CRON_SECRET` | unset | Lets an external cron drive the jobs |
| `GIT_SHA` | unset | Stamps the build on System status |

## How each piece behaves

### Two-factor sign-in

Sign-in becomes two steps. The password step returns a short-lived, single-use handle rather than a session, so nothing is signed in until the code is proven. A code is accepted one 30-second step either side of now, to forgive a phone whose clock has drifted, and **the same code is never accepted twice** — the step it belonged to is spent. Enrolment deliberately does not spend a step, so the code on screen still works for the sign-in that follows.

Ten recovery codes are issued at enrolment, shown once, and stored only as hashes. Each works once. Turning the second factor off requires the password, not just a live session.

### Support windows

An Admin opens a window from **Settings → Support access** with a reason and a length (up to the configured maximum). While it is open, the provider may start a view-as session; every action is still audited under the provider's real name. The window closes at its end time or the moment the Admin closes it.

There is exactly one exception, and it is narrow: an organization whose administrators have **never signed in** can still be opened by the provider, because there is nobody inside who could grant a window and there are no client records in it yet. The audit entry records which case applied (`viaHandoverException`).

### Failed sign-ins

Every attempt is written to `login_attempts` with its outcome. A failure against an existing account also writes an `auth.login_failed` audit entry. An address that matches no account is counted for the lock-out but **never named in the audit log or on any screen**, because a list of misses is a list of addresses worth trying.

The lock-out counts consecutive failures for one address-and-email pair inside the window, so a successful sign-in clears the run. Because it reads the table rather than process memory, a restart no longer forgives an attack in progress, and a second API instance sees the first one's failures.

### Audit tamper evidence

Each row's hash covers its own contents and the previous row's hash. A trigger computes it on insert under an advisory lock, so two concurrent writers cannot fork the chain. A second trigger refuses `UPDATE` and `DELETE` outright.

That makes rewriting history a two-step act: someone with table ownership must first disable the trigger. Even then the edit is visible, because the chain no longer computes from that row on. `audit_log_verify()` reports the first break; the **Verify the chain** button and the nightly `audit.verify_chain` job both call it, and a failed verification raises a warning on System status.

Retention is a stated period (`AUDIT_RETENTION_YEARS`, six by default) rather than an enforced deletion. Nothing in the application deletes an audit row.

### Organization lifecycle

An organization now holds a primary contact, a time zone, a signed and expiry date for the Business Associate Agreement, and free-text contract notes. Administrators are warned 60, 30 and 7 days before the agreement lapses, and on the day; the overview flags it too.

**Export** downloads the organization's configuration, accounts, feature state, support windows and audit history as JSON. It contains no password hashes.

**Decommission** is the end of the relationship: it needs the organization's slug typed and a reason given, then suspends every account and ends every session. Suspending remains the reversible pause.

### Invitations and resets

Creating an account issues a single-use invitation link; the one-time password stays in the response as the fallback. "Forgot password?" on the sign-in page sends a reset link and always answers the same way, whether or not the address exists. Both links are checked before the page shows a form, so an expired link says so rather than failing after the password is typed. Setting a password signs out every other device.

### Scheduled work

Seven jobs: credential-expiry reminders, BAA reminders, audit-chain verification, support-window closing, and pruning of sessions, sign-in attempts and spent links. Each records a run with what it did; System status lists them with a **Run now** button.

### The Support role

A support account reads the console, opens a granted support session, ends sessions, reads the audit log and reads system status. It cannot flip a switch, create or change an account, or cut another key. The menu is filtered to what the role can actually use, and each screen re-checks the capability, so the menu and the page can never disagree.

A Super Admin creates support accounts from **Security**. The rule underneath: *the master key comes from the deployment; support keys are cut by the master key; no key can copy itself.*

## What is still open

The console review's remaining items, unchanged by this work:

- **Backups** (review item 8). Point-in-time recovery and a rehearsed restore live in the database host, not the app. Still on the checklist: work-plan row R6.3.
- **Platform-wide notices and maintenance mode** (item 9). Not built.
- **The small things** (item 11): `GIT_SHA` is now read and displayed, so stamping it at deploy time is a one-line change; the dormant-account policy is still undecided.
- **Error monitoring with PHI scrubbing** (part of item 7). The readiness endpoint and job history are in; an error tracker is not.

Two notes on what this work does *not* claim:

- The second factor's shared secret is readable by the API server, because verifying a code means recomputing it. A database dump is therefore equivalent to the second factor for the accounts in it. Treat one as a reason to re-enrol.
- The audit chain proves an edit happened; it does not prevent one, and it cannot recover the original text. It is evidence, not a backup.

## Where it lives

| Piece | Code |
|---|---|
| Roles and provider capabilities | `lib/features/src/roles.ts`, `lib/features/src/platform.ts` |
| TOTP | `artifacts/api-server/src/lib/totp.ts` (+ RFC 6238 vector tests) |
| Support windows | `artifacts/api-server/src/lib/support-access.ts` (rules), `lib/support-windows.ts` (storage) |
| Sign-in attempts and the limiter | `artifacts/api-server/src/lib/login-attempts.ts` |
| Audit chain | `lib/db/migrations/0002_platform_hardening.sql` (functions and triggers), `lib/db/__tests__/audit-chain.test.ts` |
| Mail | `artifacts/api-server/src/lib/mail/` (templates declare their own sender and PHI flag) |
| Invitations and links | `artifacts/api-server/src/lib/auth-tokens.ts`, `lib/invites.ts` |
| Jobs and scheduler | `artifacts/api-server/src/lib/jobs.ts`, `routes/jobs.ts` |
| Screens | `artifacts/dls-cms/src/app/admin/platform/security`, `app/auth/set-password`, `components/admin/mfa-panel.tsx`, `components/admin/support-access-panel.tsx` |
