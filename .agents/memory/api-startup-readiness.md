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

Do not present a newly backfilled audit chain as proof that historical entries
were protected before the chain existed.

**Why:** Read-only production inspection confirmed existing unchained audit
entries alongside missing chain and append-only triggers. Hashing those entries
later cannot establish whether they were altered before protection began.

**How to apply:** Any supported repair must explicitly document the integrity
baseline and distinguish pre-repair history from subsequently protected entries.

Development schema synchronization can install tables without advancing the SQL
migration journal, and can leave older check constraints unchanged.

**Why:** After a Git rebase, startup tried to recreate existing tables because
the development journal lagged behind the actual schema. Table existence alone
was insufficient: a client-status constraint still had its older definition.

**How to apply:** Before reconciling development migration bookkeeping, compare
columns, defaults, nullability, constraints and indexes against a fresh database
built from the migrations. Repair differences before recording verified entries;
leave genuinely unapplied migrations for the normal runner. Never blindly mark
all migrations applied or use this development repair path on production.
When comparing PGlite with older PostgreSQL versions, NOT NULL may appear as
named catalog constraints only in PGlite; compare column nullability instead.