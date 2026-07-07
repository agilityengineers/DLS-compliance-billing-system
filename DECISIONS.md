# DLS-CMS — persistent project notes

Product requirements to keep in mind across all work:

- **Impersonation is Admin-only.** The "view as user" / impersonate capability must only be available to the Admin role — never Scheduler or Field Staff. The top-bar Impersonate picker in the prototype is a demo control representing the ADMIN's tool.
- One app, role-based: menus adapt to the signed-in role on both desktop and mobile. Admin can configure which sections each role sees (Settings → Menu configuration).
- Mobile is the primary surface for field staff (they travel); desktop is for review/admin work. Field uploads (photos/documents) sync to Amazon S3 and are visible on desktop.
- Field mobile home is user-selectable: Today's visits (default) or dashboard-style.
- Billing, Payroll, Staff & credentials, and Settings stay Admin-only.
- Visual style: "Duet" theme — plum sidebar/headings (#4A3D63), sage buttons (#5F7161), cream background, Source Serif 4 headings + IBM Plex Sans body. Mascot logo at assets/dls-mascot.png.
- Sidebar: collapsible rail + collapsible sections; CORE (member area) expanded by default, other sections collapsed.
- Relias LMS integration lives under a "Training & Learning" section in every view.
- The dls-cms/ folder holds the Next.js 14 + Supabase starter codebase (separate from the prototype DC).

## Integration & deployment decisions (for Claude Code handoff)

- Email: **SendGrid**. Document storage: **AWS S3 + Google Drive**.
- Deployment path: GitHub repo → **Replit** (dev and production environments).
- Auth: **Google OAuth (Google Sign-In)** + standard email/password login. No email verification — keep simple.
- Billing: build **modular** — will integrate with the client's existing billing system (TBD) and possibly **QuickBooks**. Not enough info to build the integration yet; just clean interfaces.
- EVV: **modular adapter pattern**; Colorado's designated aggregator is **Sandata** (hybrid model: state EVV solution free, or alternate vendor that integrates with Sandata). Build the Sandata integration first but keep the adapter swappable.
- Relias: **full integration** — SSO deep link AND nightly completion sync via API (API is the likely primary path). Build for both.
- Demo/fake data only until HIPAA paperwork (BAAs) is in place.
- **Impersonation requirements must be in the handoff doc**: Admin-only; every action taken while impersonating is audit-logged under the admin's real identity.
- MVP order: field app (clock-in → note → sync) → admin review/QA → billing → payroll/Relias.
