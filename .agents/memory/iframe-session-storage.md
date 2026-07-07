---
name: Client-only session must avoid document.cookie in iframes
description: Why demo/client SPA session state uses in-memory + localStorage, not document.cookie, in the dls-cms migration
---

Client-only (demo mode) session state must NOT be backed by `document.cookie`.

**Why:** When the app is embedded in a cross-site iframe (the Replit canvas
preview / `presentArtifact` iframe), browsers silently block third-party cookie
*writes*. A cookie-backed demo sign-in then sets nothing, the destination route
re-checks the session, finds it absent, and bounces back to the login screen —
so "clicking a role does nothing" even though it works fine in the direct
preview pane (top-level context) and in the Playwright test browser. This made
the symptom look like a stale preview or a routing bug when it was really cookie
partitioning.

**How to apply:** The `next/headers` `cookies()` shim
(`artifacts/dls-cms/src/shims/next-headers.ts`) is backed by a module-level
in-memory Map (survives wouter client-side navigation — same JS context) plus
`localStorage` for persistence across full reloads. localStorage is accessible
inside partitioned iframe storage, unlike blocked third-party cookies. Any
future client-only session/auth work in an embedded artifact should use the same
pattern rather than reaching for cookies. Verify sign-in from a *fresh* browser
context (starts signed out) and after a reload (stays signed in).
