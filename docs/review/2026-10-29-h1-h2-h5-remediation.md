# Remediation of H1, H2 and H5 from the production-readiness audit

**Date:** 2026-10-29 · **Follows:** [the production-readiness audit](./2026-10-29-production-readiness.md) of the same day · **Branch:** `claude/hopeful-pasteur-78y1ky`

This note records what changed in the code for the three high-priority risks, what you still have to do in the deployment (secrets, decisions, checks on the live account), and how the dependency findings were triaged. It does not touch the launch blockers B1–B3 or the concurrency and duplicate-handling findings H3–H4; those stay open.

## H2 — The provider account no longer has a known default

Think of the old bootstrap as a building whose master key was cut from a pattern printed in the architect's drawings: anyone who had read the drawings could cut their own. The drawings (this repository) contained the hash of the first Super Admin password, and the tests knew the password itself.

What the code does now:

- **No built-in password.** The committed hash is gone from the creation path. The provider account is created only when `SUPER_ADMIN_PASSWORD` is set at boot, and only if it passes the same strength rule as every other password (ten characters, a letter and a number). Without a usable value nothing is created; the boot log says so in red, `GET /api/readyz` answers `503 setup_required`, and System status carries a warning. The platform keeps serving the public website in the meantime.
- **The setup password is single-use.** The account is created with `mustChangePassword` set, and a new server-side gate (`passwordChangeGate`) lets any account holding a temporary or setup password reach exactly three things: `/api/auth/me`, `/api/auth/change-password` and `/api/auth/logout`. Everything else answers `403 PASSWORD_CHANGE_REQUIRED`. The web app already redirected such sign-ins to the change-password screen; this makes the redirect a rule an API client cannot skip. The same gate now applies to every administrator-issued temporary password.
- **A force reset is loud and complete.** `SUPER_ADMIN_FORCE_RESET=true` with `SUPER_ADMIN_PASSWORD` still rotates an existing account, but it now also ends every session of that account, makes the new password single-use, and repeats a warning on every boot until the flag is unset.
- **Accounts still on the retired default are found, not re-passworded.** The old hash is kept under the name `LEGACY_BOOTSTRAP_HASH` for one purpose: on boot, any account whose stored hash equals it is flagged `mustChangePassword` and an audit entry `platform.legacy_password_flagged` is written. The password itself is not changed, which is what "no silent credential change" means here: the holder can still sign in with the old password, and then can do nothing but choose a new one. System status counts such accounts under *Retired default password* and raises a warning while any remain.
- **The tests know no password.** Each database-backed suite supplies its own `SUPER_ADMIN_PASSWORD`, signs in, is refused by the gate, rotates the password and carries on. New tests cover the no-default path, the weak-password path, the legacy flag and its idempotence, and the gate's allow-list.

### What you have to do in the deployment

1. **Check the live account.** Sign in to the published portal as the provider. If you are sent straight to *Choose a new password*, the account was still on the retired default and has been flagged; choose a new password, then open **Security → Active sessions** and end anything you do not recognise. If you land on the console as usual, the password had already been changed and nothing was flagged; System status → *Provider account* → *Retired default password* should not appear.
2. **Fresh deployments only:** set `SUPER_ADMIN_PASSWORD` to a long random value before the first boot, sign in once, choose your own password, then delete the variable. System status warns while it is still set.
3. **Never leave `SUPER_ADMIN_FORCE_RESET=true` behind.** Use it for one restart, then unset it.

## H2 — MFA and recovery policy (needs your agreement)

The mechanisms exist; what was missing was a written policy. The proposal below is what the code supports today. Where a line says *decision*, nothing is enforced until you agree and the deployment is changed.

| Topic | Proposed policy | Status |
|---|---|---|
| Second factor on provider accounts | Required. Each provider account enrols TOTP from **Security**, stores its ten recovery codes offline, and then `REQUIRE_MFA_FOR_PLATFORM=true` is set. An un-enrolled provider account can then sign in and enrol but do nothing else. | **Decision.** The default stays `false` because turning it on before you have enrolled would lock you out of the console. Enrol first, then flip it. |
| Second factor on organization Admins | Recommended before any client record is entered; optional for a website-and-leads-only launch. | **Decision.** No flag exists yet to require it for organization roles; it would be a small addition if you want it. |
| Recovery order when a provider password or phone is lost | 1. A recovery code at sign-in (each works once; regenerate the set from **Security** afterwards). 2. The break-glass account (`SUPER_ADMIN_BREAKGLASS_EMAIL` / `_PASSWORD`), kept by a second person. 3. `SUPER_ADMIN_FORCE_RESET=true` + `SUPER_ADMIN_PASSWORD` for one restart, which is audited, ends every session and is itself single-use. | Mechanisms built. **Decision:** who holds the break-glass password, and where. System status warns while no break-glass account is configured. |
| Setup and temporary passwords | Single-use, enforced server-side. Administrator-issued temporary passwords that are more than seven days old appear on the overview as *unused temporary passwords*. | Built. |
| Database compromise | A database dump contains TOTP secrets; treat one as a reason to re-enrol every second factor and rotate every password. | Written down in the hardening note; unchanged. |

Suggested order for you: sign in and rotate (step 1 above) → enrol TOTP and file the recovery codes → configure the break-glass account → set `REQUIRE_MFA_FOR_PLATFORM=true` → confirm System status shows no provider-account warnings.

## H1 — Mail: nothing sensitive in the log, delivery you can prove

The log transport used to be a mail carrier who, finding nobody home, read the whole letter aloud in the hallway. The letter in question was an invitation or reset message, and its text *is* the single-use link.

What the code does now:

- **Envelope only.** With no provider configured, the log records the kind, recipient, sender desk and subject of each message, never its text. The outbox row is unchanged (it never held a body). In development only, `MAIL_LOG_BODIES` (on by default there, never honoured in production) restores the full text for local work.
- **Tokens stay out of the request log.** Query strings were already dropped; the link-check route carries its token in the path, and that segment is now written as `[redacted]`.
- **A mail key without a link base refuses to start.** `SENDGRID_API_KEY` with no `APP_BASE_URL` would send every link as a bare path; the API now logs a fatal line and exits instead, and System status warns.
- **A delivery check you can run from the console.** System status → *Mail* → **Send me a test message** sends a `system.mail_test` message to the signed-in provider's own address and nobody else. It names no person, organization or inquiry, carries a button to System status so you can confirm the canonical link base, and its result (`sent`, `logged`, `failed` with the provider's reason) is recorded in the outbox and audited.

What this means in log mode, so nobody is surprised: an invitation still shows the on-screen one-time password to the administrator who created the account, which remains the hand-over path. A "forgot password" request from the sign-in page cannot be fulfilled until a provider is configured; an administrator resets the password from **Settings → Accounts** instead and reads the one-time value over the phone.

### Configuring delivery (secrets and integrations)

Do this in the deployment's secret store (Replit: the *Secrets* pane of the published deployment; if the SendGrid integration is used, it supplies the key, and you still set the other two yourself):

```
SENDGRID_API_KEY=<key with the Mail Send scope only>
APP_BASE_URL=https://<the portal's public host, no trailing slash>
MAIL_FROM_DOMAIN=durablelifeskills.com
```

Before the key: authenticate `durablelifeskills.com` in SendGrid (DKIM and SPF records), add DMARC, and create the four verified senders listed in [the sender assessment](./email-senders.md). Then verify in this order:

1. Set the three variables with `SENDGRID_SANDBOX=true` and restart. System status should show *Provider: SendGrid* and *Sandbox: validate only*. Press **Send me a test message**; expect `sent` (SendGrid validated it without delivering).
2. Remove `SENDGRID_SANDBOX`, restart, press the button again, and open the message in your inbox. Check the From address and display name, and that the button opens System status at the canonical host.
3. Create a throw-away account for yourself in a test organization and confirm the invitation arrives and the link signs you in. Decommission the test organization afterwards.
4. Leave `MAIL_REDIRECT_ALL_TO` unset in production. It is a development setting; System status warns if it is present.

Nothing in these steps puts inquiry content in a message: every shipped template is marked `phi: false` and says only what kind of thing happened.

## H5 — Dependencies, triaged by where they run

The audit's totals mixed the live workspace with the archived Next.js/Supabase application under `.migration-backup/`, which has its own `package-lock.json`. That archive is not a pnpm workspace member, is not built, is excluded from the test runner, and no process in the deployment loads it. Its findings (roughly 7 critical, 44 high, 43 moderate and 5 low of the audit's combined totals) describe code that does not run. Point the scanner at `pnpm-lock.yaml` only, or delete the archive in a separate, deliberate change; nothing was deleted here.

For the active `pnpm-lock.yaml`, `pnpm audit` on this branch moved from **12 critical, 30 high, 18 moderate, 5 low** to **0 critical, 0 high, 1 moderate, 1 low**. Every update stays within the ranges the manifests already allowed except where noted; the workspace's one-day minimum release age was respected throughout.

| Package | Before → after | Where it runs | Reachable as reported? | Note |
|---|---|---|---|---|
| body-parser | 2.3.0 → 2.4.0 (via express 5.2.1 → 5.3.0) | API server, every request | **Yes.** One compressed request with trailing bytes crashed the process before routing or authentication. | Highest priority; fixed. |
| proxy-addr | 2.0.7 → 2.0.8 | API server, client-address trust | **No.** The advisory needs a *subnet* in IPv4-mapped IPv6 notation (`::ffff:10.0.0.0/8`). This app sets `trust proxy` to the hop count `1`, which never compiles a subnet. | Upgraded anyway; keep the numeric hop trust. |
| qs | 6.15.2 → 6.17.0 | API server, query parsing | Partly: array-limit bypass and `isBuffer` DoS need crafted query strings; bodies are capped at 100 kB. | Fixed. |
| zod | 3.25.76 → 4.6.7 (catalog) | API server, web app, generated schemas | Bounded: the memory-exhaustion path needs an unconstrained array, and request bodies are capped at 100 kB, so the worst case was a few megabytes of issue objects. | **Major upgrade, reviewed:** the API server already imported `zod/v4`; `drizzle-zod` 0.8 accepts `^4`; the web app's own schemas use only methods zod 4 keeps; no `z.record`, `errorMap`, `invalid_type_error` or `.strict()` usages exist. Full typecheck, both builds and all 225 tests pass on 4.6.7. |
| orval | 8.18.0 → 8.45.0 | Code generator, run by a developer on `lib/api-spec/openapi.yaml` | **No** for the eleven injection advisories and the `$ref` SSRF: they need an attacker-controlled OpenAPI document, and the only input is this repository's own spec. | Upgraded; its newer tree also drops typedoc, minimatch, brace-expansion, markdown-it and linkify-it. Regenerated output now targets zod 4 (`zod.int()`) and react-query v5 (`override.query.version: 5`); `dom.iterable` added to the client's tsconfig. Orval 8.45 needs Node ≥ 22.18 to *run* codegen; CI does not run it. |
| vite | 7.3.5 → 7.3.7 | Web build and dev server | **No** in production: static assets are served; the editor and `server.fs` findings concern the dev server, three of them on Windows. | Fixed; still never expose the dev server. |
| vitest / @vitest/mocker | 5.0.0 → 5.0.5 | Test runner | No: needs the unauthenticated mock registration endpoint of a running dev-mode test server. | Fixed. |
| postcss, nanoid, source-map-js | 8.5.15 → 8.5.32 and dependants | Web build | No: path-traversal via `sourceMappingURL` needs attacker-controlled CSS at build time. | Fixed. |
| browserslist, baseline-browser-mapping | 4.28.x → 4.29.5, 2.10.x → 2.11.34 | Web build | No: needs attacker-controlled `browserslist-stats.json` or queries. | Fixed. |
| fast-copy | 4.0.3 → 4.3.1 | pino-pretty, development logging only | No. | Fixed. |
| js-yaml, fast-uri | 4.2.0 → 4.3.2, 3.1.2 → 3.1.9 | Orval's spec parser | No: trusted spec. | Fixed. |
| postcss-selector-parser | 6.1.4 → 6.1.5; **6.0.10 remains** | Web build (`@tailwindcss/typography` pins `6.0.10` exactly) | No: parses this repository's own CSS at build time. | **Open, moderate.** Waits on an upstream release of `@tailwindcss/typography`; not worth an override. |
| esbuild | **0.27.3 remains** (pinned by the workspace override) | API bundler | No: the finding is the `--serve` dev server on Windows, which is not used. | **Open, low.** The pin exists for drizzle-kit's loader; revisit when that pin is next reviewed. |

Two counting notes. The audit's "12 critical" on the active lockfile was eleven orval advisories plus proxy-addr, none of them reachable from the public API; the one finding that *was* reachable without credentials, body-parser, was rated high. Severity labels rate the advisory, not this deployment.

### Things to know about the update mechanics

- `pnpm update` rewrites `pnpm-workspace.yaml` and strips its comments, including the supply-chain note above `minimumReleaseAge`. The committed file was restored by hand with only four catalog lines changed (`vite`, `@vitejs/plugin-react`, `tailwindcss`, `zod`). Check that file's diff whenever you run `pnpm update`.
- Transitive packages do not move by naming them alone; name the parent that declares them, or pass `--depth 99`.
- The generated files under `lib/api-client-react/src/generated` and `lib/api-zod/src/generated` changed with the Orval bump and are committed, as the repository's rule requires. Re-run `pnpm --filter @workspace/api-spec run codegen` after any spec change.

## Verification on this branch

| Check | Result |
|---|---|
| `pnpm run typecheck` (all packages) | Passed |
| `pnpm --filter @workspace/api-server run build` | Passed (the retired hash remains in the bundle by design, for detection only) |
| `PORT=24496 BASE_PATH=/ pnpm --filter @workspace/dls-cms run build` | Passed; the main chunk grew from about 979 kB to 1,015 kB minified with zod 4, which is the same code-splitting note the audit already made |
| `pnpm test` with `TEST_DATABASE_URL` on an isolated PostgreSQL 16 | 15 files, 225 tests passed (10 more than the audit's 215) |
| `pnpm audit` on `pnpm-lock.yaml` | 0 critical, 0 high, 1 moderate, 1 low (both triaged above) |
| `pnpm install --frozen-lockfile` | Passed, so CI installs unchanged |

Not verified here, because it needs the deployment or the owner: the state of the live provider account; real email receipt; the readiness 503 and audit-chain failure from blocker B3, which this work does not change; and the policy decisions marked above.
