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
  news.html         News & Insights: articles streamed in from RSS feeds (see "News feeds" below)
  privacy.html      Privacy notice for the website (footer link)
  accessibility.html Accessibility statement and how to report a barrier (footer link)
  css/styles.css    Single stylesheet; theme tokens at the top, sections numbered
  js/config.js      Per-deployment settings (the portal host the form posts to; empty = same host)
  js/main.js        Nav toggle, sticky header, news blocks from the portal's feeds, form handler (sendLead) and the form built from the portal's questions
  assets/           Display art as WebP (logo-full/-monkey/-wordmark.webp); PNG masters kept for icons + structured data
                    (logo-full.png, logo-monkey.png, logo-monkey-head.png, logo-mark.png); og-image.jpg (1200x630 share image)
  assets/photos/    Photos as WebP; full-bleed backgrounds also have a <name>-960.webp phone variant used via srcset
  assets/animals/   Service mascots as WebP
  assets/icons/     Favicons: monkey head at tab sizes (favicon.ico, favicon-16/32.png), full monkey at large sizes
                    (favicon-192/512.png, apple-touch-icon.png)
  robots.txt        Crawl rules + sitemap pointer (served at the site root)
  sitemap.xml       The indexable pages
  vercel.json       Clean URLs + asset caching
```

## SEO conventions
- **Browser tab / `<title>`:** every page starts with `DLS – …` so it is easy to spot among open tabs, then the page name, then `| Durable Life Skills, Inc.` (home: `DLS – Durable Life Skills | I/DD Care & Employment Services, Pueblo, CO`). Keep titles under ~70 characters and descriptions under ~165.
- **Per page `<head>`:** canonical URL (`https://durablelifeskills.com/` for home, `/about.html`, `/services.html`, `/contact.html`, `/news.html`, `/privacy.html`, `/accessibility.html`), `meta robots`, Open Graph + Twitter card tags pointing at `assets/og-image.jpg`, favicon links, and one JSON-LD block (`Organization`/`LocalBusiness` + `WebSite` + the page type; home adds `FAQPage`, services adds an `ItemList` of `Service`, inner pages add `BreadcrumbList`). When the address, phone, hours, service area or services change, update the JSON-LD on all four pages as well as the visible copy.
- **Home links** use `/` (not `index.html`) so the home page has a single URL. The Staff Portal link sits in the footer's bottom row beside Privacy and Accessibility and carries `rel="nofollow"`; the portal itself is `noindex`.
- **Favicon:** the monkey alone. Tab sizes (`favicon.ico`, 16px and 32px) use the monkey's head from `assets/logo-monkey-head.png` so it stays bold in a crowded tab bar; the 192px, 512px and Apple touch icons use the full-body monkey from `assets/logo-monkey.png`. `python3 scripts/site-icons.py` rebuilds all of them plus `assets/og-image.jpg`.
- **Images are WebP** for page speed. Add a new photo with `python3 scripts/site-images.py path/to/photo.jpg` (writes `photo.webp`; keep the original out of the repo). For a full-bleed hero, band or CTA background use `--wide` too, which adds `photo-960.webp`, and reference both in the HTML: `src="…/photo.webp" srcset="…/photo-960.webp 960w, …/photo.webp <width>w" sizes="100vw"`. Keep `width`/`height` attributes and `loading="lazy"` on everything below the fold. The share image (`og-image.jpg`) and the structured-data logo (`logo-full.png`) stay JPG/PNG because social networks and search engines expect those formats.
- **New page?** Add it to `sitemap.xml`, give it the same head block, list it in `pages` in `artifacts/dls-cms/marketing-site.ts`, and add it to `WEBSITE_PAGES` in `lib/features/src/website.ts` so news blocks can be placed on it.

## Run locally
```
cd site
npx serve .        # or: python3 -m http.server 8080
```

## Deploy
- **Vercel:** `npx vercel --prod` from `site/` (framework preset: Other, output dir: `.`). Or import the repo and set Root Directory to `site`.
- **Replit:** create an "HTML, CSS, JS" Repl, upload the `site/` contents to the root.

## Connect the lead form
The form on `contact.html` posts to the DLS Portal API (`POST /api/public/leads`), which
stores each inquiry, shows it in the portal's **Leads** inbox and emails the
organization's administrators. The portal serves this site at `/`, so the API is on
the same host and nothing needs configuring: `js/config.js` keeps `apiBase` empty.

Only if the site is ever served from its own domain: set `apiBase` in `js/config.js`
to the portal host (no trailing slash) and list this site's origin(s) in the API's
`PUBLIC_FORM_ORIGINS` setting. Do not use `CORS_ORIGINS` for this; that setting opens
every route with credentials.

The questions themselves are managed by the portal's administrators (Leads → Form &
funnel settings). On load the form asks `GET /api/public/forms/contact` which questions
to show and rebuilds its fields; the static fields in `contact.html` match the portal's
defaults and stay as the fallback whenever that request fails. The payload is JSON with
one key per question plus `page`; the API answers `202` when the inquiry was accepted,
`400` with a message when a field is missing or malformed, and `429` when one address
has sent too many in a few minutes.

## News feeds
News on the website comes from RSS or Atom feeds that the Super Admin manages in the portal: **Platform console → Website → News feeds** (`/admin/platform/website`).

- **Feeds** are the addresses the portal reads (tested before they are added). The portal reads each one on its server, keeps a copy for 15 minutes, and sends the website plain text and checked links only: title, date, a short summary, an https picture and the link to the original. A feed that stops answering keeps serving its last articles.
- **News blocks** are a heading, an optional introduction, the feeds whose articles are merged (newest first), how many to show, the layout (cards or a compact list), and the pages the block appears on. The same block can be on any number of pages.
- **Where a block sits.** On every page `js/main.js` asks `GET /api/public/website/feeds?page=<path>` for the blocks placed on it. A block fills the page's `<div data-feed-block="<name>">` when there is one, and its `<section data-feed-section="<name>">` takes the block's heading (`[data-feed-title]`) and introduction (`[data-feed-intro]`). A page without such a slot gets the block as its own section just before the closing call to action. A slot whose block is switched off or not placed on the page is hidden, or shows the section's `data-feed-empty` message when it has one.
- Two slots exist today: `home-latest` (the three cards on the home page) and `news-insights` (the News & Insights page). The static cards on the home page are the fallback when the portal cannot be reached.

## Brand tokens
Edit `:root` at the top of `css/styles.css`. Colors were sampled from the logo:
- Purple `#24145a` (logo rgb 32,16,80) - primary
- Green `#0e4f28` (logo rgb 0,72,32) - secondary
- Gold `#e9b121` (logo rgb 232,176,24) - accent; use `--gold-700 #8a6208` when gold must be text on white

## Photography
The active pages use local images in `assets/photos/`, including AI-generated imagery. The owner approved the existing website content and images for continued use; retain them as supplied. On October 29, 2026 the owner asked for the images to be re-encoded as WebP for page speed; the pictures themselves are unchanged (same crops and dimensions, with an extra 960px-wide copy of each full-bleed background for phones). The original JPG/PNG files remain in git history before that change. Approval does not change the images' AI-generated provenance or establish that they are documentary photographs of staff or participants.

## Content approval
On October 27, 2026, after review of the draft copy and image annotations across `index.html`, `about.html`, `services.html`, and `contact.html`, the owner confirmed: “All of the information that is created on the website is approved, and it is content that I've created, and it's paid for.”

This approval covers the existing copy, staff profiles, testimonials, service descriptions, business details, and imagery. No replacement copy or photos were supplied or requested. The existing wording, images, and approved layout have therefore been preserved, and obsolete draft/replacement annotations removed. This records owner approval, not independent verification of business claims or image licensing. Earlier hero variants in `_archive/` are not part of the active site.


## Handoff to Replit (DLS-compliance-billing-system)

The repo (agilityengineers/DLS-compliance-billing-system) is a pnpm monorepo. The existing `artifacts/dls-cms` service now serves this website at `/`, with the staff portal remaining at `/login`, `/admin/*`, and `/field/*`.

`artifacts/dls-cms/marketing-site.ts` serves these source files during development and copies the approved pages, CSS, JavaScript, assets, `robots.txt` and `sitemap.xml` into the production build. The compiled portal entry is preserved as `portal.html`; the artifact's fallback rewrite serves it for portal routes. Keep editing the files here rather than duplicating them into the artifact's public directory. Archives and deployment instructions are not copied into the published site.

`index.html` is the approved front page; `_archive/` holds the two earlier hero variants and is not needed in production.

- News cards come from the portal's news feeds (see "News feeds" below). The DLS Media feed (https://durablelifeskills.com/dls-media/feed/rss) is set up on the portal's first boot; the server reads it, so the browser no longer fetches it directly.
- The lead form posts to the portal API at `/api/public/leads` and lands in the portal's Leads inbox (see "Connect the lead form" above). On any failure the form shows a message with phone/email alternatives, keeps the entered data, and never claims delivery or logs personal details.
- Copy and imagery on the four active pages are owner-approved; see the approval record above. Do not replace them solely because earlier annotations described them as drafts.
- `vercel.json` can be deleted if deploying only from Replit.
