# DLS Smart Documentation & Billing — prototype sources (reference only)

Recovered sources from [`agilityengineers/DLS---Smart-Documentation-and-Billing-Application`](https://github.com/agilityengineers/DLS---Smart-Documentation-and-Billing-Application),
kept here as a **design reference**. Nothing in this folder is built, imported,
linted, or typechecked — it is not part of any workspace package.

## What this is

That repository ships as two files: a `README.md` and a single 2.3 MB
`index.html`. Its own README describes it as *"a clickable, front-end
prototype … mock data only — no backend, no database, no real authentication."*
The app sources are gzipped and base64-encoded inside a
`<script type="__bundler/manifest">` block and executed in the browser through
Babel, so they are not readable from the file as shipped.

`extract.mjs` recovers them:

```sh
node extract.mjs /path/to/index.html ./src
```

It is deterministic — re-running against the same `index.html` reproduces
`src/` byte for byte. React, ReactDOM and Babel vendor bundles are skipped.

## Why we kept it

The prototype has no backend, so no module here is liftable as code. What it
carries is **schema and interaction design**. Two ideas were worth taking, and
the [feature-opportunity review](../../review/2026-09-feature-opportunity-review.md)
explains the full triage:

- `02-hiring-data.jsx` — the configurable credentialing requirements registry
  (`REQUIREMENTS`), where `required` / `gating` / `appliesTo` are data rather
  than code. Implemented for DLS in `artifacts/dls-cms/src/lib/credentialing/`.
- `15-staff-credentialing.jsx` — the activation gate and the admin override
  with a logged reason.

Read it for shape, not for style. The prototype uses `window.*` globals for
module wiring and inline style objects; this codebase uses ES modules, Radix
and Tailwind.

**Do not copy its domain data.** The prototype is Georgia (NOW/COMP waivers,
GAMMIS, HCPCS `H2025` / `H2014` / `T2015`). DLS is Colorado (Colorado Medicaid,
DVR, `SCC` / `Job_Coaching` / `Day_Habilitation` / `Early_Intervention`). Its
own comments flag the Georgia rules as unverified assumptions.

## File map

| File | Contents |
|---|---|
| `01-mock-data.jsx` | Users, service codes, clients, goals, authorizations, notes, claims, remits, schedule, audit |
| `02-hiring-data.jsx` | Pipeline stages, **the requirements registry**, applicants, staff credential records |
| `03-icons.jsx` · `04-ui-primitives.jsx` | Inline SVG icon set; Card / Button / Stat / ProgressBar |
| `05-login.jsx` · `06-dashboard.jsx` | Login with role chips; per-role dashboard |
| `07-documentation.jsx` · `08-note-editor.jsx` | Note list and filters; note editor with a templated narrative scaffold |
| `09-review-queue.jsx` | Supervisor sign-off queue (approve / return with reason) |
| `10-billing.jsx` | Claims table, EDI preview mock, 835 remittance screen |
| `11-compliance.jsx` | Hardcoded demo flags, HR-1 work-requirement tracking, audit trail |
| `12-authorizations-clients.jsx` | Authorization burn-down and expiry states; client roster and detail |
| `13-reports.jsx` · `14-hiring-pipeline.jsx` | Analytics; applicant stage board and detail |
| `15-staff-credentialing.jsx` | Staff roster, **activation gate + admin override**, requirements admin screen |
| `16-careers-form.jsx` | Public 4-step careers application with e-signature |
| `17-mobile-field-app.jsx` · `18-app-shell.jsx` · `19-root-app.jsx` | Phone-frame EVV flow; sidebar shell; context and router |

Snapshot taken from upstream commit `25cdcc9`.
