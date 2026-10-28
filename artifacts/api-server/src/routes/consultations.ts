import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, lt, sql } from "drizzle-orm";
import { consultationLimits, consultationRequests, type Db } from "@workspace/db";
import { SubmitConsultationBody, SubmitConsultationResponse } from "@workspace/api-zod";

const WINDOW_MS = 15 * 60 * 1000;

export function consultationsRouter(db: Db): IRouter {
  const router = Router();
  router.post("/consultation-requests", async (req, res) => {
    // JSON-only prevents cross-site HTML forms; browser cross-origin JSON
    // requires preflight. The public endpoint never uses session privileges.
    if (!req.is("application/json") || req.headers["sec-fetch-site"] === "cross-site") {
      res.status(400).json({ error: "Please submit using the website contact form." });
      return;
    }
    try {
      const window = Math.floor(Date.now() / WINDOW_MS);
      const expiresAt = new Date((window + 1) * WINDOW_MS);
      await db.delete(consultationLimits).where(lt(consultationLimits.expiresAt, new Date()));
      // Database-backed atomic counters survive restarts and multiple instances.
      for (const [identity, limit] of [[req.ip ?? "unknown", 5], ["global", 200]] as const) {
        const key = createHash("sha256").update(`${window}:${identity}`).digest("hex");
        const [bucket] = await db.insert(consultationLimits)
          .values({ key, attempts: 1, expiresAt })
          .onConflictDoUpdate({
            target: consultationLimits.key,
            set: { attempts: sql`${consultationLimits.attempts} + 1` },
          }).returning({ attempts: consultationLimits.attempts });
        if (bucket!.attempts > limit) {
          res.setHeader("Retry-After", Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)));
          res.status(429).json({ error: "Too many attempts. Please try again later." });
          return;
        }
      }
      const parsed = SubmitConsultationBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Please check the form fields and your contact consent." });
        return;
      }
      const data = parsed.data;
      const values = {
        id: data.requestId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim(),
        phone: (data.phone ?? "").trim(),
        role: data.role,
        service: data.service ?? "",
        message: (data.message ?? "").trim(),
        consent: data.consent,
      };
      if (!values.firstName || !values.lastName ||
          (values.phone && !/^[+()\d\s.-]{7,40}$/.test(values.phone))) {
        res.status(400).json({ error: "Please check your name and phone number." });
        return;
      }
      const inserted = await db.insert(consultationRequests).values(values)
        .onConflictDoNothing().returning({ id: consultationRequests.id });
      if (!inserted.length) {
        const [existing] = await db.select().from(consultationRequests)
          .where(eq(consultationRequests.id, values.id));
        if (!existing || Object.entries(values).some(([key, value]) =>
          existing[key as keyof typeof values] !== value)) {
          res.status(409).json({ error: "Please try submitting your updated request again." });
          return;
        }
      }
      res.status(201).json(SubmitConsultationResponse.parse({ ok: true }));
    } catch {
      // Database errors can include SQL parameters (personal information).
      // Do not forward them to the generic error logger or return their detail.
      res.status(503).json({ error: "We could not confirm receipt. Please retry or contact us directly." });
    }
  });
  return router;
}
