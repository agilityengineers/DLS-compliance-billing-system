# Super Admin console: what it covers now, and what you are not yet thinking about

**Audience:** the platform owner (Super Admin) and the developers who maintain the console. **Date:** 2026-09-12. Code references are for the developers; skip them if you are reading as the owner.

> **Update, 2026-09-12.** Items 1 to 8 of "what you are not yet thinking about" have since been built, along with item 10. Each is marked below, and [the platform hardening note](./2026-09-platform-hardening.md) describes what shipped and what an operator still has to configure. The analysis itself is left as written.

## The short version

Until now the Super Admin had one menu entry, "Platform console", with three things stacked on one page: the feature switchboard, the organizations with their accounts, and the audit table. That is fine for a first week and useless by the third month, for the same reason a hotel would not run its front desk, housekeeping and security from a single clipboard.

The console is now nine screens in five groups, each answering one question you will actually ask:

| Group | Screen | The question it answers |
|---|---|---|
| Overview | Platform overview | What needs me today, what happened this week, where is everything? |
| Organizations & people | Organizations | Which tenants exist, has each one been handed to its administrator, do I need to suspend or rename one? |
| Organizations & people | Accounts | Who is this person, can they get in, how do I get them back in (or out)? |
| Capabilities | Feature switchboard | Which capabilities may organizations use at all (tier 1)? |
| Capabilities | Feature adoption | Which organization has actually switched on what, and for which roles? |
| Security & compliance | Support access | How do I help an organization without standing access to its records, and what is the record of every time I did? |
| Security & compliance | Active sessions | Who is signed in right now, from where, and how do I end a session for a lost phone? |
| Security & compliance | Audit log | Who did what, when, across the whole platform, and can I hand that to someone as a file? |
| System | System status | Is the service healthy, are the migrations applied, what sign-in policy is in force, is anything misconfigured? |

Everything you could do before, you can still do, in the same place you would look for it. Nothing on any provider screen opens a client record; that rule is unchanged.

## The mental model

Think of yourself as the building manager, not a tenant. You decide which apartments exist, hand each new tenant their keys, decide which amenities the building offers, and keep the master key for emergencies. What happens inside an apartment is the tenant's business: the organization's Admin decides who on their staff gets which amenity, and their Settings screen is where they do it.

The two-tier switchboard is that arrangement in software. Tier 1 (your switchboard) says whether an amenity exists in the building. Tier 2 (their Settings) says whether that apartment uses it and who inside gets a key. The new Feature adoption screen is you walking the corridor and seeing, door by door, what is switched on, without going in.

The master key is the "view as" session. It is the only way into an apartment, it is logged every time, and the log is now on its own screen where you cannot lose track of it.

## What you are not yet thinking about

These are ranked by how much they would hurt on a bad day. Each says what exists now, what is missing, and where it is tracked. Effort is a rough developer estimate.

### 1. You are one lost password away from a locked building

**Status: closed.** A break-glass provider account (`SUPER_ADMIN_BREAKGLASS_*`) and TOTP two-factor sign-in, which the deployment can require of provider accounts. See the [hardening note](./2026-09-platform-hardening.md).

There is exactly one provider account, protected by one password, with no second factor. If that password is lost or leaked, recovery means a deployment operator setting `SUPER_ADMIN_PASSWORD` and `SUPER_ADMIN_FORCE_RESET=true` and restarting the API. That works, but it is a scramble, and it means whoever holds the deployment secrets effectively holds the master key too.

* Now: the overview and System status both flag "only one provider account". System status shows whether the force-reset flag is still on so you do not leave it that way.
* Missing: a second, rarely used provider account created at deployment time and kept in a safe (the "break-glass" account); a time-based second factor (TOTP) on provider and Admin sign-ins; a documented rotation drill.
* Track as: new work-plan rows under section 5 (security). Effort: break-glass account is configuration only; TOTP is about 3 days.

### 2. The support window is a promise, not yet a rule

**Status: closed.** An Admin grants a time-boxed window from Settings, and outside one the API refuses the session. Decision D-02 is now implemented rather than described.

Decision D-02 in the work plan says the provider gets into an organization's data only inside a support window the organization's Admin grants, for a limited time. Today you can start a "view as" session whenever you like. It is audited and now visible while it runs, but nobody on the organization's side has to say yes first.

* Now: the Support access screen states this plainly, shows every running session, and keeps the full history one click away.
* Missing: an Admin-side "grant support access for the next N hours" control, enforced by the API before `/auth/impersonate` succeeds, plus automatic expiry.
* Track as: work-plan row 0.8 (impersonation) and D-02. Effort: about 2 days.

### 3. You can see successful sign-ins but not the failed ones

**Status: closed.** Every attempt is recorded, failures against a real account are audited, and the limiter reads the database so it survives restarts and spans instances.

Failed sign-ins are counted in memory for the lock-out rule and then forgotten. A password-guessing attempt against Lisa's account leaves no trace unless it succeeds. The lock-out counter also lives inside one API process, so it stops working the moment the API runs on two instances.

* Now: the audit log shows every successful sign-in and the sign-in policy is visible on System status.
* Missing: an `auth.login_failed` audit entry for attempts against existing accounts (never for unknown emails, which would let an attacker enumerate addresses through the log); an overview note when an account crosses the lock-out threshold; the limiter moved into the database.
* Effort: about 1 day.

### 4. The audit log has no retention rule and no tamper evidence

**Status: closed.** A hash chain with a verify button and a nightly job, triggers that refuse updates and deletes outright, and a stated retention period shown on System status.

The log is append-only from the app's point of view, and you can now filter and export it. But nothing states how long it is kept, nothing archives it, and a database administrator could edit a row without leaving a mark.

* Now: CSV export from the Audit log screen; filters by kind, organization and date.
* Missing: a written retention period (HIPAA's six-year documentation rule is the usual anchor), a scheduled export to write-once storage, and a hash chain or periodic digest so an edited row is detectable.
* Track as: work-plan rows R5.7 and R6.3. Effort: retention policy is a paragraph; scheduled export about 1 day; hash chain about 2 days.

### 5. Organizations have a start but no middle or end

**Status: closed.** Contract and contact fields, a recorded Business Associate Agreement with expiry warnings, a full export, and a decommission flow.

You can create, rename and suspend an organization. You cannot record when its Business Associate Agreement was signed, export its data, or retire it. There is also no per-organization configuration beyond the switchboard: time zone, billing identifiers (NPI, tax ID) and the like are still server-wide environment settings.

* Now: the Organizations screen shows the hand-over checklist so a half-onboarded tenant is obvious.
* Missing: contract and BAA fields with dates, an export ("give me everything for this organization"), a decommission flow, and per-organization settings that the switchboard alone cannot express.
* Track as: new roadmap items; BAA tracking ties to R1.x. Effort: fields and dates 1 day; export and decommission 3 to 4 days once domain data is in the database.

### 6. Handing over a password by hand does not scale

**Status: closed.** Single-use invitation and reset links with a self-service recovery flow, and a mailer that records and logs everything until a provider is configured. The SendGrid key remains the operator's step.

New accounts get a one-time password that you read out or paste into a message. That is acceptable for one organization with a dozen people. It is not acceptable for the second organization, and it means there is no self-service "forgot my password".

* Now: the Accounts screen shows who is still holding an unused temporary password, and the overview flags ones older than a week.
* Missing: a mail provider with a signed BAA, invitation emails, and a self-service reset link.
* Track as: work-plan rows 0.5 and R1.3; see `docs/review/email-senders.md`. Effort: 2 days after the provider decision.

### 7. Nothing wakes anyone up

**Status: mostly closed.** A scheduler with seven jobs and a visible history, a cron endpoint for hosts that sleep idle instances, and a readiness endpoint. An uptime monitor and an error tracker are configuration, not code.

System status tells you whether the database answered and whether migrations are pending, but only when you look. There is no uptime check, no alert when the API stops answering, and no scheduled job runner at all, so the nightly credential-expiry sweep and the Relias sync that the roadmap describes simply never run.

* Missing: an external uptime monitor pointed at `/api/healthz`, error monitoring with PHI scrubbing, and a scheduler (a cron in the deployment or a small in-process scheduler) with a "last ran" line on System status.
* Track as: work-plan rows R6.5 and 2.7. Effort: monitoring is configuration; the scheduler about 1 day.

### 8. Backups exist only if the host says so

**Status: still open.** This lives in the database host rather than in the application.

The console cannot show you whether point-in-time recovery is on or when a restore was last rehearsed, because that lives in the database host, not the app. It still belongs on your checklist.

* Track as: work-plan row R6.3. Effort: a restore drill is an afternoon.

### 9. You have no way to talk to everyone

**Status: still open.**

There is no platform-wide notice ("maintenance Sunday 6 to 7 am") and no maintenance mode. When you need to take the service down, the first anyone hears of it is an error page.

* Missing: a banner you can set from the console with a start and end time, and a read-only mode for planned maintenance.
* Effort: about 1 day.

### 10. Every provider operator is a Super Admin

**Status: closed.** A Support role reads the console and works an incident but changes no configuration, creates no accounts and cuts no keys.

If a second person ever helps with support, they get the whole master key ring: switchboard, organizations, accounts, and view-as. A support engineer should be able to open a view-as session and read the audit log without being able to switch off billing for everyone.

* Missing: a second provider role ("Support") with a narrower grant, expressed in the same role hierarchy the API already enforces.
* Effort: about 2 days.

### 11. Small things worth an hour each

**Status: partly closed.** System status now reads and displays `GIT_SHA`, so stamping it at deploy time is a one-line change. The dormant-account policy is still undecided.

* Stamp the build. System status shows the Git commit if `GIT_SHA` is set at deploy time; set it, so "which version is running" is never a guess.
* Show the web app's data mode on the overview. The demo-data banner already exists; the provider should also see "this deployment serves synthetic client data" in one place.
* Decide what "dormant" means for you. The overview notes accounts with no sign-in for 90 days; if your policy is to suspend them, say so and the note becomes an action.

## A sensible order

The engineering half of this list is done; what remains is configuration and two decisions.

1. **This week, in the deployment:** set the break-glass account; enrol both provider accounts in two-factor and then require it; set a cron secret and point a schedule at the jobs endpoint; point an uptime monitor at the health endpoint; stamp the build.
2. **Before the second organization:** the mail key and base URL, so invitations and resets are sent rather than logged; record each organization's agreement dates.
3. **Before real PHI:** a rehearsed database restore; an error tracker with PHI scrubbing; decide the dormant-account policy; decide whether a maintenance-notice banner is worth building.

The exact settings are listed in the [platform hardening note](./2026-09-platform-hardening.md).

## For the developers: what shipped

API (`artifacts/api-server/src/routes/platform.ts`, all behind `requireRole("Super_Admin")`):

| Route | Purpose |
|---|---|
| `GET /platform/overview` | Counts, 7-day activity and the attention list (`lib/platform-overview.ts`, pure, unit-tested) |
| `GET /platform/adoption` | Both-tier feature state for every organization |
| `GET /platform/sessions` · `DELETE /platform/sessions/:id` | Live sessions; end one (audited as `session.revoked`) |
| `DELETE /platform/users/:id/sessions` | Sign one person out everywhere (audited as `user.sessions_revoked`) |
| `GET /platform/audit?category=&action=&orgId=&actorUserId=&since=&limit=` | Filtered platform log; `action` accepts a comma-separated list |
| `GET /platform/system` | Process, database and migration status, sign-in policy, provider bootstrap, configuration warnings (`lib/system-status.ts`; `migrationStatus()` in `lib/db`) |

Web (`artifacts/dls-cms`): `components/admin/nav-config.ts` holds the grouped `PLATFORM_NAV` and the `activeHref()` rule (longest matching prefix wins, so a sub-screen no longer lights up the overview); the sidebar and mobile drawer respect each section's `defaultOpen`. Screens live under `app/admin/platform/*` with their panels in `components/admin/platform/*`; the audit table, labels and summaries are shared through `components/admin/config-audit.tsx`.

Tests: `artifacts/api-server/src/__tests__/platform-overview.test.ts` (rules), the provider block in `api.test.ts` (every new route, including the 403 for an organization Admin), and `artifacts/dls-cms/src/components/admin/__tests__/nav-config.test.ts`.
