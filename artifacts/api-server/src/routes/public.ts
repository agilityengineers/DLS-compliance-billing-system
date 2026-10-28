// The one surface the public can write to: the website's inquiry form.
//
// No session, no cookie. The form on the marketing site asks for its questions
// here and posts the answers here, and everything else about the request is
// treated with suspicion: the organization has to be taking inquiries, the
// answers are checked against that organization's own question list, a hidden
// field catches the bots that fill in everything, a per-address limit catches
// the ones that do not, and the answer is the same 202 whether a row was
// stored, a duplicate was folded in, or a bot was quietly ignored.
import { Router, type IRouter, type Request } from "express";
import cors from "cors";
import type { Db } from "@workspace/db";
import { recordAudit } from "../lib/audit";
import type { AppConfig } from "../lib/config";
import { HttpError } from "../lib/errors";
import {
  addActivity,
  countRecentSubmissions,
  createLead,
  findRecentByEmail,
  firstOpenStage,
  listQuestions,
  pagePathOf,
  parseSubmission,
  resolvePublicOrg,
  snapshotOf,
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

  /** A submission. Flat body: one key per question, plus `page` and the honeypot. */
  router.post("/public/leads", async (req, res) => {
    const org = await resolvePublicOrg(db, config, orgSlugOf(req));
    const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>;
    const accepted = () => {
      res.status(202).json({ ok: true });
    };

    // A field no person sees or fills in. A bot that does gets the same reply
    // as everyone else, and nothing is stored.
    if (typeof body.company_website === "string" && body.company_website.trim() !== "") return accepted();

    const ip = req.ip ?? null;
    const since = new Date(Date.now() - config.leadWindowMs);
    if (ip && (await countRecentSubmissions(db, org.id, ip, since)) >= config.leadMaxPerIp) {
      res.setHeader("Retry-After", String(Math.ceil(config.leadWindowMs / 1000)));
      throw new HttpError(429, "RATE_LIMITED", "Too many requests from this address. Please try again in a few minutes.");
    }

    const questions = await listQuestions(db, org.id);
    const parsed = parseSubmission(questions, body);

    // The same person sending the same form twice in a few minutes is a
    // refresh or a double-click, not a second inquiry: note it on the first.
    if (parsed.email) {
      const existing = await findRecentByEmail(db, org.id, parsed.email, since);
      if (existing) {
        await addActivity(db, { leadId: existing.id, type: "submitted", details: { source: "website", duplicate: true }, actorUserId: null });
        return accepted();
      }
    }

    const stage = await firstOpenStage(db, org.id);
    const sourcePage = pagePathOf(body.page);
    const lead = await createLead(db, {
      orgId: org.id,
      stageId: stage.id,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      answers: parsed.answers,
      questionSnapshot: snapshotOf(questions),
      source: "website",
      sourcePage,
      consentAt: parsed.consent ? new Date() : null,
      ip,
      actorUserId: null,
    });
    await recordAudit(db, {
      orgId: org.id,
      actorUserId: null,
      action: "lead.received",
      targetType: "lead",
      targetId: lead.id,
      details: { source: "website", page: sourcePage },
      ip,
    });

    // Tell the organization's administrators something arrived. The email
    // carries nothing the person wrote — only a link into the portal — and
    // the reply to the website does not wait for the mail provider.
    void notifyAdmins(org.id, org.name, lead.id);
    accepted();
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
