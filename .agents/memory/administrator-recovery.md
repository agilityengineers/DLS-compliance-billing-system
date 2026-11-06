---
name: Administrator recovery lifecycle
description: Operational boundaries for recovering administrator accounts without recurring password resets.
---

Treat administrator recovery as a bounded operation, not a persistent deployment setting.

**Why:** Leaving forced recovery enabled after a successful password change can
overwrite the chosen password on a later restart. Recovery in production also
does not recover the separate development account; this caused repeated reports
of apparently broken passwords.

**How to apply:** Identify the environment before diagnosing credentials. After
the recovery boot, remove the reset flag and restart development (or arrange the
required production republish) before declaring recovery complete. Verify that
the account update timestamp remains unchanged across a normal restart. Explain
that saved production configuration is not proof the running deployment has
adopted it. Do not weaken the retired-credential guard or synchronize passwords
between environments.
