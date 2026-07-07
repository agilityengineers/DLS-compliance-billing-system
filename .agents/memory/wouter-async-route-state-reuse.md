---
name: wouter Switch reuses child component state across routes
description: Why route-change redirects/loaders can get stuck when a single wrapper component renders every route in a wouter Switch
---

When every `<Route>` in a wouter `<Switch>` renders the SAME wrapper component type
at the same tree position (e.g. one `<AsyncRoute>` that runs a Next-style loader),
React reconciles them as ONE instance across route changes and PRESERVES its state.

**Symptom:** navigation "works" (wouter re-renders, `useLocation`/pathname update,
Switch re-matches the new route) but the page is stuck — e.g. a redirect from `/`
to `/login` leaves the login route showing a spinner forever, re-firing
`navigate('/login')`. The wrapper carried over the previous route's `redirectTo`
(and `node`/`error`) state, and its loader effect never re-ran because its deps
(params/searchParams) were identical between the two routes.

**Why it misleads:** it looks like wouter isn't re-rendering, but it is. The child
re-renders on location change via its own `useLocation` subscription; the parent
Switch re-matches correctly. The bug is React instance reuse, not routing.

**Fix:** key the matched subtree by location so it fully remounts per navigation:
`const [loc] = useLocation(); return <Switch key={loc}>…</Switch>`. Alternatively
include the current location in the wrapper's loader effect deps so it re-runs and
resets state on every URL change.

**How to apply:** any time a single component renders all routes in a Switch and
holds per-route async/loader/redirect state, guarantee a remount (key by location)
or reset that state on location change. Don't rewrite the router chasing a phantom
"wouter won't re-render" bug — add a log at the Switch level first to confirm it
DOES re-match, then look for state carried across the reused child instance.
