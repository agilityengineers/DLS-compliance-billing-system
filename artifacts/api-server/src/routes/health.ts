import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { migrationStatus, type Db } from "@workspace/db";

/**
 * Two endpoints, deliberately different.
 *
 * `/healthz` answers "is this process up" and touches nothing else, so an
 * uptime monitor hitting it every minute costs nothing and keeps answering
 * while the database is down (which is what you want: the alert should say
 * "database", not "everything").
 *
 * `/readyz` answers "can it actually serve", which means the database replies
 * and the schema is current. Point a deployment's readiness probe at this one.
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
      const latencyMs = Math.round((performance.now() - started) * 10) / 10;
      const ready = migrations.pending.length === 0;
      res.status(ready ? 200 : 503).json({
        status: ready ? "ready" : "migrations_pending",
        database: { ok: true, latencyMs },
        migrations: { applied: migrations.applied, total: migrations.total, pending: migrations.pending },
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
