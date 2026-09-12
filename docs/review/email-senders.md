# SendGrid sender addresses: assessment and build plan

**Status:** Assessment for DLS owner review. Part B (build) starts after the owner confirms the mapping and answers the questions in Part A.
**Date:** 2026-09-11 · **Related:** [WORKPLAN 0.5, 2.7, R1.3](./WORKPLAN.md) · [roadmap](./2026-09-roadmap.md)

## Context

Durable Life Skills is provisioning four verified SendGrid senders on `durablelifeskills.com`, and the portal needs a fixed rule for which one each system email goes out under:

- `noreply@durablelifeskills.com`
- `staff@durablelifeskills.com`
- `schedule@durablelifeskills.com`
- `partner@durablelifeskills.com`

This document assesses how each address should be used given what the portal does today and what is on the roadmap, and lays out the build once the mapping is confirmed.

---

## Part A: Assessment and recommendations

### What exists today

Think of the current codebase as a house with a mailbox slot cut into the door but no mail carrier. The pieces:

- **One orphaned SendGrid adapter** at `artifacts/dls-cms/src/lib/integrations/email.ts`. It lives in the browser-only Vite app, the `@sendgrid/mail` package is not installed, and Vite aliases it to an empty shim. Nothing imports it.
- **One sender only.** The adapter reads a single `SENDGRID_FROM_EMAIL` env var. There is no reply-to, no display name, no HTML, no per-purpose sender.
- **One message type**, credential-expiry warnings at 30/14/3 days, written against demo data and never scheduled (review defect #29).
- **No invitation or password-reset email.** Admins hand-deliver a one-time password shown once on screen (`artifacts/api-server/src/lib/users.ts`, `one-time-password.tsx`). Workplan item 0.5 explicitly says "email invites not wired, no mail provider yet."
- **No email log table** in the live Drizzle schema. The `notification_log` table exists only in the archived Supabase migrations.
- **A HIPAA gate.** `assertBaaGate("SendGrid")` throws unless `BAA_SIGNED_ALL_VENDORS=true`. Workplan R1.3 offers the alternative: "or emails carry zero PHI."

So everything below is greenfield, and the sender mapping can be designed cleanly rather than retrofitted.

### The one design rule that matters: PHI

This system handles Medicaid I/DD client data. Until DLS signs a Business Associate Agreement with SendGrid, **no email may contain client-identifying information**. The practical pattern is the "bank alert" model: the email says *what kind* of thing happened and links into the portal, and the portal shows the details. For example, "A visit on your schedule for Tuesday changed. Sign in to view." rather than "Your 2pm visit with Maria G. was cancelled."

This rule is what makes the four-address split safe to build now. Each sender below is classified as PHI-free by design, with a note on which messages would only become richer after the BAA.

### Recommended mapping

Analogy: think of the four addresses as four desks in the DLS front office. Each desk sends its own kind of letter, and when you reply, the letter goes back to the right desk. The noreply desk is the printer in the corner that nobody sits at.

#### 1. noreply@durablelifeskills.com — Account and security

Display name: **Durable Life Skills** · Reply-To: none · Audience: every user, all roles

Messages that need no human reply and that must never be mistaken for a conversation:

| Message | Trigger | Status today |
|---|---|---|
| Account invitation with set-password link | `createUserAccount` | Temp password shown on screen only |
| Password reset link | `resetUserPassword`, and a future self-service "forgot password" | Admin-issued only |
| Password changed confirmation | `POST /api/auth/change-password` | None |
| Account suspended / reactivated | `updateUserAccount` status change | None |
| Signed out of all devices (session revocation) | `revokeAllSessions` | None |
| New sign-in from unrecognized device (later) | login | None |
| Platform bootstrap / Super Admin password rotation notice | `bootstrap.ts` | None |

All PHI-free by nature. This is the first sender to build because it closes workplan item 0.5 (invite-based onboarding and password reset).

#### 2. staff@durablelifeskills.com — Workforce, HR and compliance

Display name: **DLS Staff Office** · Reply-To: staff@ · Audience: Field Staff, Schedulers, and management

The "HR desk." Anything about the employee's own standing with the agency, or management notices about the workforce:

| Message | Recipient | PHI? |
|---|---|---|
| Credential / license / required-training expiring in 30 / 14 / 3 days | The employee | No |
| Credential expired, claims now blocked | The employee, cc management | No |
| Weekly management digest: who has expiring credentials | Admin | No |
| Relias training overdue / nightly sync result | Employee / Admin | No |
| Timesheet submitted / payroll period certified | Employee / Admin | No |
| Payroll blocked: notes outstanding for named employees | Admin | No (employee names only) |
| Offboarding complete, caseload reassigned | Admin | No if client names omitted |
| **Incident report submitted, needs review** | Admin | Yes if details included. Send "an incident was submitted, sign in to review" only |

Replies to staff@ land with whoever runs HR/compliance at DLS, which is the right person to answer "how do I renew my QMAP?"

#### 3. schedule@durablelifeskills.com — Visits and scheduling

Display name: **DLS Scheduling** · Reply-To: schedule@ · Audience: Field Staff and Schedulers

The "dispatch desk." Nothing here exists yet, but the handoff doc names "visit/med reminders" as the second wave of transactional email:

| Message | Recipient | PHI? |
|---|---|---|
| Visit assigned / rescheduled / cancelled | Field staff | **Yes** if client named. Send "your schedule changed for {date}, sign in" until BAA |
| Tomorrow's schedule / this week's schedule digest | Field staff | Same rule: count and times only, no client names |
| Recurring-week generation summary | Scheduler | No (counts only) |
| Physician order expiring (blocks scheduling) | Scheduler / Admin | Borderline. "An order expires in 14 days, sign in" is safe; the client name is not |
| Visit missed / not clocked in (EVV) | Scheduler | Same |
| Medication (eMAR) reminders | Field staff | Yes. Post-BAA only, or in-app only |

Replies to schedule@ go to the scheduling office, which is exactly who a field worker emails when they can't make a shift.

#### 4. partner@durablelifeskills.com — Outside organizations and the platform relationship

Display name: **Durable Life Skills Partnerships** · Reply-To: partner@ · Audience: org admins (from the platform), and later DVR, CCBs, case managers, employers, payers

This one needs the client's judgement most. The system has **no "partner" role today**; the only occurrence of the word is "trading partner" in the 837P claims code. Two audiences fit the name:

**(a) Platform to organization** (Agility Engineers to DLS management, now; to other agencies later if the platform is sold on):

| Message | Trigger |
|---|---|
| Your organization has been set up; your Admin account is ready | `POST /api/platform/organizations` + first Admin |
| A capability was enabled / disabled for your organization | `platform.feature_toggled` |
| Organization suspended / reactivated | `org.updated` |
| Support "view as" session started and ended on your organization | `auth.impersonation_started/stopped` |
| Release notes / feature moved from preview to ready | Manual |

**(b) External agencies** (post-BAA and only after client contact fields exist, roadmap 1.1):

| Message | Recipient |
|---|---|
| Monthly SLS billing note delivered | CCB / case manager |
| DVR monthly progress report / employment notice delivered | DVR counselor |
| Job-coaching placement confirmation | Employer supervisor |
| Claim batch submitted (no PHI, batch ID only) | Clearinghouse contact |

Recommendation: build (a) now because it is PHI-free and cheap, and hold (b) for the BAA and the client-contact schema work. The client should confirm they intend partner@ to cover both, or only the external agencies.

**Note:** the platform-to-org messages in (a) are arguably sent by Agility Engineers, not DLS. If the client would rather those come from a vendor address, that is a one-line config change; the plan keeps them under partner@ per the request.

### Questions to confirm with the client

1. **Reply-To:** Who monitors the staff@, schedule@, and partner@ inboxes? Each needs a real mailbox (Google Workspace or similar) because replies will come.
2. **partner@ scope:** platform-to-org notices, external agencies (DVR, CCB), or both?
3. **Incident notices:** "an incident was submitted" with no details, from staff@, to which Admin(s)?
4. **Schedule digests:** daily the night before, weekly on Sunday, or both? And should they be on by default?
5. **PHI stance:** proceed PHI-free now (all messages link into the portal) and enrich after the SendGrid BAA? This is the recommended path and is what the plan assumes.
6. **Display names:** are "Durable Life Skills", "DLS Staff Office", "DLS Scheduling", "Durable Life Skills Partnerships" acceptable, or do they have house wording?

### SendGrid-side setup (client or dev, outside this repo)

- Authenticate the durablelifeskills.com domain in SendGrid (DNS CNAMEs for DKIM/SPF) so all four senders inherit it. This is one setup, not four.
- Add DMARC once the domain is authenticated.
- Create the four verified senders with the display names above.
- Create one API key with Mail Send scope only, stored in the host secret store.
- Set up a SendGrid category per sender (`account`, `staff`, `schedule`, `partner`) so deliverability and bounce rates can be read per desk.
- Optionally, a bounce/spam-complaint Event Webhook into the API so a bad address shows up in the email log.

---

## Part B: Build plan (execute after client sign-off)

### Architecture

- **New workspace package `lib/email` (`@workspace/email`)**, DB-free, modelled on `lib/features`: sender registry, typed template functions, PHI classification, transport interface with a SendGrid transport and a log transport. Depends on `@sendgrid/mail` (mind `minimumReleaseAge: 1440` in `pnpm-workspace.yaml`).
- **api-server `src/lib/mailer.ts`**, DB-aware: render → PHI gate → dedupe reservation in `email_log` → deliver → status update. Injected via `createApp({ mailer })` so tests can capture mail.
- **Sender is declared on the template, not by the caller.** That is the mechanism that guarantees an invite can never leave from partner@.
- **PHI is a static flag per template.** `phi: true` templates return `blocked_phi` (logged, not thrown) unless `BAA_SIGNED_ALL_VENDORS=true`. All phase 1 and 2 templates are `phi: false`.
- **SendGrid transport details:** categories `sender:<key>` and `kind:<template>`, `customArgs` with the email log id, click and open tracking disabled (token links must not be rewritten), `SENDGRID_SANDBOX` support.

### Config (`artifacts/api-server/src/lib/config.ts`, extend `AppConfig` with `email`, `appBaseUrl`, `cronSecret`)

| Var | Meaning |
|---|---|
| `SENDGRID_API_KEY` | present → sendgrid mode, absent → log mode (safe default, nothing changes for a keyless Replit) |
| `EMAIL_SENDER_DOMAIN` | default `durablelifeskills.com`; local parts are fixed |
| `APP_BASE_URL` | link base; required when in sendgrid mode (throw otherwise) |
| `BAA_SIGNED_ALL_VENDORS` | opens `phi: true` templates |
| `SENDGRID_SANDBOX` | validate but don't deliver |
| `EMAIL_REDIRECT_ALL_TO` | dev only; throw if set in production |
| `CRON_SECRET` | job route auth (phase 2) |
| `INVITE_TTL_HOURS` / `RESET_TTL_MINUTES` | defaults 168 / 60 |

### Schema (`lib/db/src/schema/notifications.ts`, export from `schema/index.ts`, generate with `pnpm --filter @workspace/db run generate --name email_and_auth_tokens`)

- `email_log`: id, kind, sender, org_id, user_id, recipient, subject, dedupe_key (unique, nullable), provider_message_id, status (`pending|sent|logged|failed|deduped|blocked_phi`), error, sent_at, created_at. Subject only, never the body.
- `auth_tokens`: id, user_id, purpose (`invite|password_reset`), token_hash (unique), expires_at, used_at, created_by, created_at. Reuse `generateToken`/`hashToken` from `artifacts/api-server/src/lib/session.ts`.
- Phase 2: `staff_credentials` (org_id, user_id, kind `license|training`, name, identifier, expires_on, required). The live schema has no credential data today; the old sweep read the browser demo dataset.

### Phase 1: service + noreply@ (closes workplan 0.5)

1. `lib/email` package: `senders.ts`, `transport.ts`, `render.ts` (escapeHtml, table-based layout, no remote images), `templates/noreply.ts` with `account.invite`, `account.password_reset`, `account.password_changed`, `account.suspended`, `account.sessions_revoked`. Wire into root `tsconfig.json`, `artifacts/api-server/tsconfig.json`, api-server `package.json`, `vitest.config.ts`.
2. Migration for `email_log` + `auth_tokens`.
3. `src/lib/auth-tokens.ts`: `issueToken` (invalidates prior unused tokens for user+purpose), `redeemToken` (single query: hash, purpose, unused, unexpired, user Active, org active).
4. `users.ts`: `createUserAccount` and `resetUserPassword` gain `delivery: "email" | "screen"`; default email when transport is live, else screen (today's behaviour). Email path issues a token and sends; on `failed`/`blocked_phi` it **falls back to the on-screen temp password** so an admin is never stuck. Response becomes `{ user, temporaryPassword: string|null, invite: {sentTo, expiresAt}|null }` (additive).
5. `routes/auth.ts`: public `GET /api/auth/token/:purpose/:token`, `POST /api/auth/accept-invite`, `POST /api/auth/reset-password`, `POST /api/auth/forgot-password` (always 200, rate-limited by IP via the existing `LoginLimiter`). Redemption sets the password, revokes sessions, creates a session, audits. `change-password` and suspension send their notices fire-and-forget.
6. `routes/org.ts` + `routes/platform.ts`: `POST .../users/:id/resend-invite`.
7. Web: `src/app/auth/set-password/page.tsx` (reuse the `/auth/reset` form layout), route in `App.tsx`, `lib/api/admin.ts` types, "Invitation sent to … / Resend" state in `accounts-panel.tsx` and `organizations-panel.tsx`, "Forgot password?" link in `credentials-form.tsx`.
8. Ship in log mode, then sandbox, then live.

### Phase 2: staff@

`staff_credentials` table + Admin CRUD routes; `src/jobs/credential-expiry.ts` ported from the old sweep (30/14/3 marks, dedupe key `credential_expiry_{mark}d:{credentialId}:{expiresOn}`, template `staff.credential_expiry`, optional Admin digest at the 3-day mark); `POST /api/jobs/credential-expiry` in `routes/jobs.ts` guarded by `x-cron-secret` (timingSafeEqual) or an Admin session ("Run now" button). Scheduler: GitHub Actions `schedule:` cron curling the endpoint, host-independent while D-07 is open (in-process `setInterval` rejected: autoscale deployment). Delete the orphaned `artifacts/dls-cms/src/lib/integrations/email.ts`, `repo-notifications.ts`, and the `@sendgrid/mail` Vite alias. Follow-ups under the same sender: offboarding, incident-submitted, payroll notices.

### Phase 3: schedule@

Templates written PHI-minimal by default (`phi: false`: date, time, "open the app" link, no client names). PHI-bearing variants as separate `phi: true` templates. Hooks land when visits enter the live schema (roadmap 1.1); digests reuse the jobs router.

### Phase 4: partner@

`org.created` / `org.feature_enabled` / `org.suspended` / impersonation notices from `routes/platform.ts` to org Admins (`phi: false`). DVR/CCB document delivery later as `phi: true` with SendGrid attachments, after the BAA and client-contact fields.

### Tests

- `lib/email/__tests__/`: sender resolution (noreply has no reply-to, others reply to self, categories), every template renders and escapes HTML, every noreply/staff template is `phi: false`.
- `api-server/src/lib/__tests__/mailer.test.ts` (no DB): PHI + live transport + no BAA → `blocked_phi`, transport untouched; log transport delivers; dedupe on `23505` → `deduped`; redirect-all rewrites recipient.
- `config.test.ts`: the three boot-time throws.
- Existing DB-backed `src/__tests__/api.test.ts`: inject a capturing live transport; create user → invite, no temp password; accept-invite sets cookie; token reuse → 400; forgot → reset → old sessions gone; sweep twice → `sent:1` then `deduped:1`; wrong secret → 403.

### Verification

1. `pnpm test` green including the new suites.
2. Boot the API with no key: create a user, confirm on-screen temp password still appears and `email_log` has a `logged` row.
3. Boot with `SENDGRID_API_KEY` + `SENDGRID_SANDBOX=true` + `APP_BASE_URL`: create a user, confirm SendGrid accepts (202) and the row is `sent`.
4. Drop sandbox, send an invite to a test mailbox, follow the link, land signed in, confirm the From/Reply-To headers per sender.
