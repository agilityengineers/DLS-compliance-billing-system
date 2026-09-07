---
name: GitHub updates after artifact migration
description: How to handle upstream changes that still target the pre-Replit root application.
---

After the original root application has been migrated into a Replit artifact, merging later upstream commits can route changed files into the archived migration tree rather than the live artifact.

**Why:** Git rename detection follows the original files into the archive, while the user-facing application runs from the artifact directory. A merge can therefore succeed and include the upstream commit history without changing what appears in the preview.

**How to apply:** After every upstream merge, inspect where changed runtime files landed. Port relevant app, component, and library changes into the live artifact while preserving its Vite routing, shims, workspace configuration, and Replit-specific fixes. Verify the artifact itself, not only the merge graph.