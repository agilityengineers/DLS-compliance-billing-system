import { getDb, runMigrations } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createApp } from "./app";
import { bootstrapPlatform } from "./lib/bootstrap";
import { loadConfig } from "./lib/config";
import { Scheduler } from "./lib/jobs";
import { logger } from "./lib/logger";
import { createMailer } from "./lib/mail";
import { createServer } from "node:http";
import { createStartupGate } from "./lib/startup-gate";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main(): Promise<void> {
  let phase = "configuration";
  const startupDeadline = setTimeout(() => {
    logger.fatal({ phase }, "API startup exceeded 45 seconds; refusing to serve an uninitialized application");
    process.exit(1);
  }, 45_000);
  // Keep the deadline active even when a driver has no referenced handles.
  const gate = createStartupGate();
  const server = createServer(gate.listener);
  server.on("error", (err) => {
    logger.fatal({ err, phase }, "API HTTP server error");
    process.exit(1);
  });
  phase = "listen";
  await new Promise<void>((resolve) => {
    server.listen(port, "0.0.0.0", resolve);
  });
  logger.info({ port }, "HTTP listener open; API requests return 503 until initialization completes");

  phase = "configuration";
  const config = loadConfig();
  const db = getDb();

  phase = "database_connection";
  logger.info({ phase }, "Checking database connectivity");
  await db.execute(sql`SELECT 1`);
  logger.info({ phase }, "Database connectivity confirmed");

  // Replit Publish applies the development schema to production. Replaying
  // local migrations at runtime can conflict with that managed schema.
  if (process.env.NODE_ENV !== "production") {
    phase = "development_migrations";
    logger.info({ phase }, "Applying development database migrations");
    await runMigrations(db);
  }

  phase = "platform_bootstrap";
  logger.info({ phase }, "Initializing platform data");
  const boot = await bootstrapPlatform(db, config);
  logger.info(
    {
      platformRowsAdded: boot.platformRowsAdded,
      orgCreated: boot.orgCreated,
      superAdminCreated: boot.superAdminCreated,
      breakGlassCreated: boot.breakGlassCreated,
    },
    "Platform bootstrap complete"
  );

  const mailer = createMailer(db, config);
  if (config.mail.mode === "log") {
    logger.warn("No mail provider configured — invitations and reset links will be recorded and logged, not sent");
  }
  // Maintenance work (expiry reminders, pruning, chain verification) needs
  // something to drive it. See lib/jobs.ts for why an external cron can drive
  // the same jobs instead.
  const scheduler = new Scheduler({ db, config, mailer });
  scheduler.start();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => scheduler.stop());
  }

  const app = createApp({ db, config, mailer });
  gate.ready(app);
  phase = "ready";
  clearTimeout(startupDeadline);
  logger.info({ port }, "API initialization complete; server ready");
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
