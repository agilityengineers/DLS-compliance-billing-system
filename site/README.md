# Durable Life Skills, Inc. - Website

Static, dependency-free marketing site (HTML + CSS + vanilla JS). No build step.

## Structure
```
site/
  index.html              Home (Variant A: logo card top-left, overlapping header)
  index-logo-right.html   Home (Variant B: logo card pinned top-right in hero)
  index-hero-balanced.html Home (Variant C: logo top-left, hero copy split into two columns) - delete the ones you don't keep
  about.html        Mission & Approach (+ team)
  services.html     All 7 services with anchor links
  contact.html      Contact info + lead-capture form (#lead-form)
  css/styles.css    Single stylesheet; theme tokens at the top, sections numbered
  js/config.js      Per-deployment settings (the portal host the form posts to)
  js/main.js        Nav toggle, sticky header, form handler (sendLead)
  assets/           logo-full.png, logo-mark.png, favicon-*.png
  vercel.json       Clean URLs + asset caching
```

## Run locally
```
cd site
npx serve .        # or: python3 -m http.server 8080
```

## Deploy
- **Vercel:** `npx vercel --prod` from `site/` (framework preset: Other, output dir: `.`). Or import the repo and set Root Directory to `site`.
- **Replit:** create an "HTML, CSS, JS" Repl, upload the `site/` contents to the root.

## Connect the lead form
The form on `contact.html` posts to the DLS Portal API, which stores each
inquiry, shows it in the portal's **Leads** inbox and emails the organization's
administrators. Two settings connect them:

1. **On the site:** open `js/config.js` and set `apiBase` to the portal host,
   e.g. `"https://portal.durablelifeskills.com"` (no trailing slash). Leave it
   `""` only while the site and the portal are served from the same host.
2. **On the portal's API:** list this site's origin(s) in `PUBLIC_FORM_ORIGINS`,
   e.g. `https://durablelifeskills.com,https://www.durablelifeskills.com`. The
   browser refuses the request until the origin is listed. (Do not use
   `CORS_ORIGINS` for this; that setting opens every route with credentials.)

The payload is JSON with one key per form field —
`{ firstName, lastName, email, phone, role, service, message, consent, page, submittedAt }` —
and the API answers `202` when the inquiry was accepted, `400` with a message
when a field is missing or malformed, and `429` when one address has sent too
many in a few minutes. The questions themselves are managed by the portal's
administrators; the static fields in `contact.html` match the portal's
defaults.

## Brand tokens
Edit `:root` at the top of `css/styles.css`. Colors were sampled from the logo:
- Purple `#24145a` (logo rgb 32,16,80) - primary
- Green `#0e4f28` (logo rgb 0,72,32) - secondary
- Gold `#e9b121` (logo rgb 232,176,24) - accent; use `--gold-700 #8a6208` when gold must be text on white

## Photography
Photos are Unsplash stock loaded from images.unsplash.com, tagged `STOCK PLACEHOLDER` in the HTML. Replace with DLS photography (download into `assets/` and update the `src`). The current site's gallery images were AI-generated "mission control" scenes and were not reused.

## Draft copy
Search for `DRAFT COPY - CONFIRM` and `IMAGE PLACEHOLDER` comments.


## Handoff to Replit (DLS-compliance-billing-system)

The repo (agilityengineers/DLS-compliance-billing-system) is a pnpm monorepo; the Vite portal app at `artifacts/dls-cms` already serves `/`. Do not drop these files at the repo root. Recommended: add this folder as `artifacts/marketing-site/` (a new static artifact deployed to the public domain, e.g. durablelifeskills.com), keeping the portal on `portal.durablelifeskills.com`. If both must share one host, serve `site/` as static files from the Express app in `artifacts/api-server` at `/` and move the portal under `/portal`.

`index.html` is the approved front page; `_archive/` holds the two earlier hero variants and is not needed in production.

- News cards load live from https://durablelifeskills.com/dls-media/feed/rss in `js/main.js` (`NEWS_FEED`). If the repl proxies requests, allow that origin; the feed sends CORS headers so a direct browser fetch works.
- Lead form posts to the portal API at `/api/public/leads` (see "Connect the lead form" above): set `apiBase` in `js/config.js` and `PUBLIC_FORM_ORIGINS` on the API.
- Photos in `assets/photos/` are AI-generated placeholders marked with HTML comments; swap for DLS photography when available.
- Copy marked `<!-- DRAFT COPY - CONFIRM -->` still needs client sign-off.
- `vercel.json` can be deleted if deploying only from Replit.
