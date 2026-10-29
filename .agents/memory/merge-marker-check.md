---
name: Merge marker detection
description: Decorative equals-sign dividers can block merge continuation.
---

Avoid runs of seven equals signs in comments in files being resolved.

**Why:** The merge continuation checker treated decorative comment dividers as unresolved conflict markers even after actual conflict markers were removed.

**How to apply:** If continuation reports markers but anchored searches find none, search for marker substrings inside comments and replace decorative dividers with dashes.
