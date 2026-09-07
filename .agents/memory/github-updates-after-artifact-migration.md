---
name: GitHub updates after artifact migration
description: How to handle upstream changes that still target the pre-Replit root application.
---

After the original root application has been migrated into a Replit artifact, merging later upstream commits can route changed files into the archived migration tree rather than the live artifact.

**Why:** Git rename detection follows the original files into the archive, while the user-facing application runs from the artifact directory. A merge can therefore succeed and include the upstream commit history without changing what appears in the preview.

**How to apply:** After every upstream merge, inspect where changed runtime files landed. Port relevant app, component, and library changes into the live artifact while preserving its Vite routing, shims, workspace configuration, and Replit-specific fixes. Verify the artifact itself, not only the merge graph.

Replit’s GitHub connectors and the local Git credential helper are separate. Attaching a connector may provide authorized API access without repairing a rejected `git push` credential, and Version Control may leave or restart a `pull --rebase`.

**Why:** Treating connector authorization as proof that command-line Git is authenticated can cause repeated rebases or incomplete synchronization.

**How to apply:** Check for rebase metadata before syncing. Prefer a normal fast-forward push when Git credentials work; if they do not, use an already-authorized GitHub connection only with the user’s requested repository and verify local and remote branch SHAs afterward.