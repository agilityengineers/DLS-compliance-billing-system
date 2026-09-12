// Maintenance jobs driven from outside the process.
//
// The in-process scheduler is enough on a host that keeps the API warm. On one
// that sleeps idle instances it is not, so the same jobs can be driven by an
// external cron (a GitHub Actions schedule, the host's own scheduler) with a
// shared secret. Both paths go through the same claim, so whichever gets there
// first does the work and the other stands down.
import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import type { Db } from "@workspace/db";
import type { AppConfig } from "../lib/config";
import { forbidden, notFound } from "../lib/errors";
import { JOBS, findJob, runJob } from "../lib/jobs";
import type { Mailer } from "../lib/mail";

function secretMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function jobsRouter(db: Db, config: AppConfig, deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();

  router.post("/jobs/:name/run", async (req, res) => {
    if (!config.cronSecret) throw forbidden("No CRON_SECRET is configured, so external job runs are refused.");
    const header = req.get("x-cron-secret") ?? undefined;
    if (!secretMatches(header, config.cronSecret)) throw forbidden("Bad or missing job secret.");
    const name = req.params.name;
    if (name === "all") {
      const results = [];
      for (const job of JOBS) results.push(await runJob({ db, config, mailer: deps.mailer }, job.name, "cron"));
      res.json({ results });
      return;
    }
    if (!findJob(name)) throw notFound("Unknown job.");
    res.json(await runJob({ db, config, mailer: deps.mailer }, name, "cron"));
  });

  return router;
}
