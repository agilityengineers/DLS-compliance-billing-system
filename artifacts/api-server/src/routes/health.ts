import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { migrationStatus, usersTable, type Db } from "@workspace/db";

/**
 * Two endpoints, deliberately different.
 *
 * `/healthz` answers "is this process up" and touches nothing else, so an
 * uptime monitor hitting it every minute costs nothing and keeps answering
 * while the database is down (which is what you want: the alert should say
 * "database", not "everything").
 *
 * `/readyz` answers "can it actually serve", which means the database replies,
 * the schema is current, and the platform has an owner (a fresh deployment
 * has none until SUPER_ADMIN_PASSWORD is supplied at boot). Point a
 * deployment's readiness probe at this one. It says which condition failed,
 * never who the owner is.
 */
export function healthRouter(db: Db): IRouter {
  const router: IRouter = Router();

  router.get("/healthz", (_req, res) => {
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  });

  router.get("/readyz", async (_req, res) => {
    const started = performance.now();
    try {
      await db.execute(sql`select 1`);
      const migrations = await migrationStatus(db);
      const [owner] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.role, "Super_Admin"), eq(usersTable.status, "Active")))
        .limit(1);
      const latencyMs = Math.round((performance.now() - started) * 10) / 10;
      const migrated = migrations.pending.length === 0;
      const providerAccount = owner !== undefined;
      const ready = migrated && providerAccount;
      res.status(ready ? 200 : 503).json({
        status: ready ? "ready" : !migrated ? "migrations_pending" : "setup_required",
        database: { ok: true, latencyMs },
        migrations: { applied: migrations.applied, total: migrations.total, pending: migrations.pending },
        /** False until the first provider account exists (SUPER_ADMIN_PASSWORD at first boot). */
        providerAccount,
      });
    } catch (e) {
      res.status(503).json({
        status: "database_unavailable",
        database: { ok: false, error: e instanceof Error ? e.message : String(e) },
      });
    }
  });

  return router;
}

export default healthRouter;
