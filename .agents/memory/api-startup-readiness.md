---
name: API startup readiness
description: Keep port availability distinct from application readiness during publishing.
---

Do not treat an open HTTP port as proof that the API is ready, or make readiness return success while database initialization is pending.

**Why:** Publishing repeatedly reported only an unopened port after the API stalled at its database probe. An early listener was chosen to separate port detection from database readiness, not to bypass initialization. The production connection failure still requires confirmation on the next publish; local connectivity alone does not establish that it is fixed.

**How to apply:** Preserve unavailable responses for all routes until initialization completes. When debugging publishing, distinguish build success, listener availability, and database readiness. A successful read-only production query through platform tooling does not prove the deployed process can connect.