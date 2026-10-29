---
name: API startup readiness
description: Keep port availability distinct from application readiness during publishing.
---

Do not treat an open HTTP port as proof that the API is ready, or make readiness return success while database initialization is pending.

**Why:** Publishing repeatedly reported only an unopened port after the API stalled at its database probe. An early listener was chosen to separate port detection from database readiness, not to bypass initialization. Later live checks confirmed database connectivity, but exposed a separate managed-schema-sync limitation: production had tables without the audit functions/triggers or migration journal records present in development.

**How to apply:** Preserve unavailable responses for all routes until initialization completes. When debugging publishing, distinguish build success, listener availability, and database readiness. A successful read-only production query through platform tooling does not prove the deployed process can connect.

Do not equate managed table synchronization with execution of SQL migrations or installation of trigger-based security controls.

**Why:** A successful publish can coexist with missing audit protections and an empty migration journal. Checking the journal alone cannot distinguish absent tables from missing bookkeeping.

**How to apply:** Verify production readiness and security objects read-only. Use the supported Publish schema flow; do not add production DDL scripts or startup migration workarounds. Do not suppress readiness failures merely to make publishing appear healthy.