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
  js/main.js        Nav toggle, sticky header, form handler (sendLead / LEAD_ENDPOINT)
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
Open `js/main.js`, set `LEAD_ENDPOINT` to your Zapier Catch Hook / HubSpot / Formspree URL. Payload is JSON:
`{ firstName, lastName, email, phone, role, service, message, consent, page, submittedAt }`.

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
- Lead form posts to `LEAD_ENDPOINT` in `js/main.js` (currently a placeholder). Point it at your Replit route, e.g. `/api/leads`.
- Photos in `assets/photos/` are AI-generated placeholders marked with HTML comments; swap for DLS photography when available.
- Copy marked `<!-- DRAFT COPY - CONFIRM -->` still needs client sign-off.
- `vercel.json` can be deleted if deploying only from Replit.
