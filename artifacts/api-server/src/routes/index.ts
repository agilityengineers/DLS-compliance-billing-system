import { Router, type IRouter } from "express";
import type { Db } from "@workspace/db";
import type { AppConfig } from "../lib/config";
import { authRouter } from "./auth";
import { credentialingRouter } from "./credentialing";
import healthRouter from "./health";
import { orgRouter } from "./org";
import { platformRouter } from "./platform";

export function apiRouter(db: Db, config: AppConfig): IRouter {
  const router: IRouter = Router();
  router.use(healthRouter);
  router.use(authRouter(db, config));
  router.use(platformRouter(db, config));
  router.use(orgRouter(db));
  router.use(credentialingRouter(db));
  return router;
}
