import { getDb, runMigrations } from "@workspace/db";
import { createApp } from "./app";
import { bootstrapPlatform } from "./lib/bootstrap";
import { loadConfig } from "./lib/config";
import { Scheduler } from "./lib/jobs";
import { logger } from "./lib/logger";
import { createMailer } from "./lib/mail";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = getDb();

  // Schema first, then the rows the app cannot run without.
  await runMigrations(db);
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
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
