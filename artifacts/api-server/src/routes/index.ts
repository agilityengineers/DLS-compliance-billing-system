import { Router, type IRouter } from "express";
import type { Db } from "@workspace/db";
import type { AppConfig } from "../lib/config";
import type { Mailer } from "../lib/mail";
import { authRouter } from "./auth";
import { credentialingRouter } from "./credentialing";
import { healthRouter } from "./health";
import { jobsRouter } from "./jobs";
import { orgRouter } from "./org";
import { platformRouter } from "./platform";

export interface RouterDeps {
  mailer: Mailer;
}

export function apiRouter(db: Db, config: AppConfig, deps: RouterDeps): IRouter {
  const router: IRouter = Router();
  router.use(healthRouter(db));
  router.use(authRouter(db, config, deps));
  router.use(platformRouter(db, config, deps));
  router.use(orgRouter(db, config, deps));
  router.use(credentialingRouter(db));
  router.use(jobsRouter(db, config, deps));
  return router;
}
