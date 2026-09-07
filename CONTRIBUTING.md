# Contributing

## Routine changes to `main`

`main` is the canonical branch. Routine updates must be made through a pull
request targeting `main`.

Before a pull request can merge, it must:

1. Receive at least one approving review.
2. Pass the required **DLS-CMS Typecheck** check.
3. Resolve any review conversations required by the repository rules.

Force-pushes and branch deletion remain disabled for `main`.

The reviewable source for these settings is
`.github/main-branch-protection.json`. An authenticated repository
administrator can reapply that exact policy with:

```sh
scripts/apply-main-branch-protection.sh
```

The script updates repository settings only; it does not modify branch history.

## Administrator recovery path

The `main` protections apply to repository administrators. There is no standing
administrator bypass.

If a broken rule or unavailable required check creates a genuine repository
lockout, an authorized repository owner may use GitHub's repository settings to
make a separately governed, temporary rule change. This is an emergency
recovery procedure, not an alternative contribution workflow.

For emergency recovery:

1. Record the reason and intended recovery in an issue before changing the rule
   whenever access permits.
2. Temporarily change only the setting that blocks recovery.
3. Make the smallest change needed to restore repository operation without
   rewriting branch history.
4. Immediately restore the complete versioned policy with
   `scripts/apply-main-branch-protection.sh`.
5. Follow up through the normal pull-request process to review and validate the
   recovered state.