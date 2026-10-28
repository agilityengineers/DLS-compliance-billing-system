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
The active pages use local images in `assets/photos/`, including AI-generated imagery. The owner approved the existing website content and images for continued use; retain them as supplied. Approval does not change the images' AI-generated provenance or establish that they are documentary photographs of staff or participants.

## Content approval
On October 27, 2026, after review of the draft copy and image annotations across `index.html`, `about.html`, `services.html`, and `contact.html`, the owner confirmed: “All of the information that is created on the website is approved, and it is content that I've created, and it's paid for.”

This approval covers the existing copy, staff profiles, testimonials, service descriptions, business details, and imagery. No replacement copy or photos were supplied or requested. The existing wording, images, and approved layout have therefore been preserved, and obsolete draft/replacement annotations removed. This records owner approval, not independent verification of business claims or image licensing. Earlier hero variants in `_archive/` are not part of the active site.


## Handoff to Replit (DLS-compliance-billing-system)

The repo (agilityengineers/DLS-compliance-billing-system) is a pnpm monorepo. The existing `artifacts/dls-cms` service now serves this website at `/`, with the staff portal remaining at `/login`, `/admin/*`, and `/field/*`.

`artifacts/dls-cms/marketing-site.ts` serves these source files during development and copies the approved pages, CSS, JavaScript, and assets into the production build. The compiled portal entry is preserved as `portal.html`; the artifact's fallback rewrite serves it for portal routes. Keep editing the files here rather than duplicating them into the artifact's public directory. Archives and deployment instructions are not copied into the published site.

`index.html` is the approved front page; `_archive/` holds the two earlier hero variants and is not needed in production.

- News cards load live from https://durablelifeskills.com/dls-media/feed/rss in `js/main.js` (`NEWS_FEED`). If the repl proxies requests, allow that origin; the feed sends CORS headers so a direct browser fetch works.
- Lead form delivery is not connected (`LEAD_ENDPOINT` in `js/main.js` is empty). Until a service is configured, submission shows an error with phone/email alternatives, preserves the entered data, and does not claim delivery or log personal details.
- Copy and imagery on the four active pages are owner-approved; see the approval record above. Do not replace them solely because earlier annotations described them as drafts.
- `vercel.json` can be deleted if deploying only from Replit.
