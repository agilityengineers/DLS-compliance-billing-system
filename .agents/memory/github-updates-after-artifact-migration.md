---
name: GitHub updates after artifact migration
description: How to handle upstream changes that still target the pre-Replit root application.
---

After the original root application has been migrated into a Replit artifact, merging later upstream commits can route changed files into the archived migration tree rather than the live artifact.

**Why:** Git rename detection follows the original files into the archive, while the user-facing application runs from the artifact directory. A merge can therefore succeed and include the upstream commit history without changing what appears in the preview.

**How to apply:** After every upstream merge, inspect where changed runtime files landed. Port relevant app, component, and library changes into the live artifact while preserving its Vite routing, shims, workspace configuration, and Replit-specific fixes. Verify the artifact itself, not only the merge graph.

The uploaded DLS marketing website is intended to be the public front page, not a replacement for the staff sign-in experience.

**Why:** The user explicitly identified the uploaded website as the new front page. Merging static source files alone did not connect them to the running service.

**How to apply:** Preserve the approved website design and keep staff portal routes accessible when changing website hosting or routing. Do not treat an upload-only merge as a completed website integration.

Replit’s GitHub connectors and the local Git credential helper are separate. Attaching a connector may provide authorized API access without repairing a rejected `git push` credential, and Version Control may leave or restart a `pull --rebase`.

**Why:** Treating connector authorization as proof that command-line Git is authenticated can cause repeated rebases or incomplete synchronization.

**How to apply:** Check for rebase metadata before syncing. Prefer a normal fast-forward push when Git credentials work; if they do not, use an already-authorized GitHub connection only with the user’s requested repository and verify local and remote branch SHAs afterward.

`main` is the canonical source-of-truth branch for this project. The former Claude/Replit default branch is retained only as a safety copy and should not receive new product work.

**Why:** GitHub review work and the migrated Replit application diverged across two branches, making each surface appear incomplete. The user explicitly chose to reconcile both histories into `main` and make it the default.

**How to apply:** Start future work from `main`, keep Replit tracking `origin/main`, and port any upstream changes into the live artifact before merging. Do not switch the repository default back to the safety branch.