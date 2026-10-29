// The one surface the public can write to: the website's inquiry form.
//
// No session, no cookie. The form on the marketing site asks for its questions
// here and posts the answers here, and everything else about the request is
// treated with suspicion: the organization has to be taking inquiries, the
// answers are checked against that organization's own question list, a hidden
// field catches the bots that fill in everything, a per-address limit on
// attempts catches the ones that do not, and the answer is the same 202
// whether a row was stored, a retry was folded into the inquiry it repeats,
// or a bot was quietly ignored. What makes a retry a retry, and why a changed
// form — under the same key or from the same email — is a new inquiry rather
// than something to fold away, is explained in lib/leads.ts.
import { Router, type IRouter, type Request } from "express";
import cors from "cors";
import type { Db } from "@workspace/db";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { HttpError } from "../lib/errors";
import {
  acceptWebsiteSubmission,
  listQuestions,
  pagePathOf,
  recordAttempt,
  resolvePublicOrg,
  submissionIdOf,
  toPublicQuestion,
} from "../lib/leads";
import { logger } from "../lib/logger";
import { leadReceivedEmail, type Mailer } from "../lib/mail";
import { listOrgAdmins } from "../lib/users";

export function publicRouter(db: Db, config: AppConfig, deps: { mailer: Mailer }): IRouter {
  const router: IRouter = Router();

  // The marketing site lives on its own domain, so its browser calls here are
  // cross-origin. Only the origins in PUBLIC_FORM_ORIGINS get a CORS answer,
  // only on these routes, and never with credentials. The global CORS_ORIGINS
  // setting (credentialed, every route) is a different door and stays shut.
  // No origins configured means same-origin only: `origin: false` sends no
  // header at all.
  router.use(
    "/public",
    cors({
      origin: config.publicFormOrigins.length > 0 ? config.publicFormOrigins : false,
      credentials: false,
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
      maxAge: 600,
    })
  );

  const orgSlugOf = (req: Request): string | undefined => (typeof req.query.org === "string" ? req.query.org : undefined);

  /** The questions the website should ask, in order. */
  router.get("/public/forms/contact", async (req, res) => {
    const org = await resolvePublicOrg(db, config, orgSlugOf(req));
    const questions = await listQuestions(db, org.id);
    res.json({ organization: { name: org.name }, questions: questions.map(toPublicQuestion) });
  });

  /**
   * A submission. Flat body: one key per question, plus `page`, the honeypot,
   * and `submissionId` — a key the website makes up once per filled-in form
   * and sends again with every retry of it.
   */
  router.post("/public/leads", async (req, res) => {
    const org = await resolvePublicOrg(db, config, orgSlugOf(req));
    const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>;
    const accepted = () => {
      res.status(202).json({ ok: true });
    };
    const ip = req.ip ?? null;
    const submissionId = submissionIdOf(body.submissionId);

    // A field no person sees or fills in. A bot that does gets the same reply
    // as everyone else, and nothing of what it sent is stored — but the
    // attempt is counted, so a bot that keeps posting runs into the limit.
    if (typeof body.company_website === "string" && body.company_website.trim() !== "") {
      await recordAttempt(db, { orgId: org.id, ip, submissionId, outcome: "ignored" });
      return accepted();
    }

    const questions = await listQuestions(db, org.id);
    const sourcePage = pagePathOf(body.page);
    const result = await acceptWebsiteSubmission(db, {
      orgId: org.id,
      ip,
      maxAttemptsPerIp: config.leadMaxPerIp,
      windowMs: config.leadWindowMs,
      submissionId,
      questions,
      body,
      sourcePage,
    });

    switch (result.outcome) {
      case "rate_limited":
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
        throw new HttpError(429, "RATE_LIMITED", "Too many requests from this address. Please try again in a few minutes.");
      case "invalid":
        throw result.error;
      case "retry":
        // The inquiry it repeats already has its timeline entry; nothing else to do.
        return accepted();
      case "created": {
        await recordAudit(db, {
          orgId: org.id,
          actorUserId: null,
          action: "lead.received",
          targetType: "lead",
          targetId: result.lead.id,
          details: { source: "website", page: sourcePage, earlierLeadId: result.earlierLeadId, relatedBy: result.relatedBy },
          ip,
        });
        // Tell the organization's administrators something arrived. The email
        // carries nothing the person wrote — only a link into the portal — and
        // the reply to the website does not wait for the mail provider.
        void notifyAdmins(org.id, org.name, result.lead.id);
        return accepted();
      }
    }
  });

  async function notifyAdmins(orgId: string, orgName: string, leadId: string): Promise<void> {
    try {
      const admins = await listOrgAdmins(db, orgId);
      const link = deps.mailer.link(`/admin/leads/${leadId}`);
      for (const admin of admins) {
        await deps.mailer.send(leadReceivedEmail({ adminName: admin.fullName, orgName, link }), {
          to: admin.email,
          userId: admin.id,
          orgId,
          dedupeKey: `lead_received:${leadId}:${admin.id}`,
        });
      }
    } catch (err) {
      logger.error({ err, leadId }, "Could not notify administrators of a new inquiry");
    }
  }

  return router;
}
