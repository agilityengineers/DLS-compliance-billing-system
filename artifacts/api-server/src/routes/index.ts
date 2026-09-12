import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { db } from "@workspace/db";
import { createCredentialingRouter } from "./credentialing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(createCredentialingRouter(db));

export default router;
