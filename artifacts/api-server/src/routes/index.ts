import { Router, type IRouter } from "express";
import type { Db } from "@workspace/db";
import type { AppConfig } from "../lib/config";
import type { Mailer } from "../lib/mail";
import { authRouter } from "./auth";
import { billingRouter } from "./billing";
import { clientsRouter } from "./clients";
import { credentialingRouter } from "./credentialing";
import { healthRouter } from "./health";
import { jobsRouter } from "./jobs";
import { leadsRouter } from "./leads";
import { orgRouter } from "./org";
import { platformRouter } from "./platform";
import { publicRouter } from "./public";
import { websiteRouter } from "./website";
import type { FeedFetcher } from "../lib/website-feeds";

export interface RouterDeps {
  mailer: Mailer;
  /** Reads a website feed; tests swap in a fake so nothing leaves the machine. */
  feedFetcher?: FeedFetcher;
}

export function apiRouter(db: Db, config: AppConfig, deps: RouterDeps): IRouter {
  const router: IRouter = Router();
  router.use(healthRouter(db));
  router.use(authRouter(db, config, deps));
  router.use(publicRouter(db, config, deps));
  router.use(websiteRouter(db, config, deps));
  router.use(platformRouter(db, config, deps));
  router.use(orgRouter(db, config, deps));
  router.use(leadsRouter(db, config, deps));
  router.use(clientsRouter(db, config, deps));
  router.use(billingRouter(db, config, deps));
  router.use(credentialingRouter(db));
  router.use(jobsRouter(db, config, deps));
  return router;
}
