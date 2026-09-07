# Contributing

## Routine changes to `main`

`main` is the canonical branch. Routine updates must be made through a pull
request targeting `main`.

Before a pull request can merge, it must:

1. Receive at least one approving review.
2. Pass the required **DLS-CMS Typecheck** check.
3. Resolve any review conversations required by the repository rules.

Force-pushes and branch deletion remain disabled for `main`.

## Administrator recovery path

Repository administrators retain a bypass path for genuine emergencies, such
as restoring access after a broken rule or recovering from an unavailable
required check. Bypass is exceptional and must not be used for routine product
changes.

When an administrator bypass is necessary:

1. Make the smallest change needed to restore repository operation.
2. Do not rewrite existing branch history.
3. Record the reason in the commit or related issue.
4. Follow up through the normal pull-request process to review and validate the
   resulting state.