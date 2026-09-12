import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import type { Db } from "@workspace/db";
import { loadConfig, type AppConfig } from "./lib/config";
import { errorHandler, notFound } from "./lib/errors";
import { logger } from "./lib/logger";
import { createMailer, type Mailer } from "./lib/mail";
import { attachSession } from "./middlewares/auth";
import { apiRouter } from "./routes";

export interface CreateAppOptions {
  db: Db;
  config?: AppConfig;
  /** Disable request logging (tests). */
  quiet?: boolean;
  /** Injected so a test can capture mail instead of sending or logging it. */
  mailer?: Mailer;
}

export function createApp({ db, config = loadConfig(), quiet = false, mailer }: CreateAppOptions): Express {
  const app: Express = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);

  if (!quiet) {
    app.use(
      pinoHttp({
        logger,
        serializers: {
          req(req) {
            return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
          },
          res(res) {
            return { statusCode: res.statusCode };
          },
        },
      })
    );
  }

  // Same-origin by default (the web app and /api share one host). Cross-site
  // callers must be listed explicitly because the session rides in a cookie.
  if (config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins, credentials: true }));
  }
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(attachSession(db, config));

  app.use("/api", apiRouter(db, config, { mailer: mailer ?? createMailer(db, config) }));
  app.use("/api", (_req, _res, next) => next(notFound("No such API route.")));
  app.use(errorHandler);

  return app;
}
