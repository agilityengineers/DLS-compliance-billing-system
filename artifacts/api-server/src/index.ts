import { getDb, runMigrations } from "@workspace/db";
import { createApp } from "./app";
import { bootstrapPlatform } from "./lib/bootstrap";
import { loadConfig } from "./lib/config";
import { logger } from "./lib/logger";

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
    { platformRowsAdded: boot.platformRowsAdded, orgCreated: boot.orgCreated, superAdminCreated: boot.superAdminCreated },
    "Platform bootstrap complete"
  );

  const app = createApp({ db, config });
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
