// Delivery: render → PHI gate → reserve → transport → record.
//
// Every message lands in `mail_outbox` whether or not a provider is
// configured, which is what makes "no mail key" a visible state rather than a
// silent one: without SENDGRID_API_KEY the system still issues invitations and
// reset links, records exactly what it would have sent, and writes the link to
// the log for the operator. Nothing is lost, nothing is pretended.
import { eq } from "drizzle-orm";
import { mailOutboxTable, type Db, type MailStatus } from "@workspace/db";
import type { AppConfig } from "../config";
import { logger } from "../logger";
import { MAIL_SENDERS, type MailMessage } from "./templates";

export * from "./templates";

export interface SendOptions {
  to: string;
  /** Who and what the message is about, for the console's outbox view. */
  userId?: string | null;
  orgId?: string | null;
  /**
   * Makes the send idempotent. A job that runs twice reserves the same key the
   * second time, loses on the unique index and reports `deduped` instead of
   * sending a duplicate.
   */
  dedupeKey?: string | null;
}

export interface SendResult {
  status: MailStatus;
  id: string | null;
  error?: string;
}

export interface MailTransport {
  readonly name: string;
  deliver(message: MailMessage, envelope: { to: string; from: string; fromName: string; replyTo: string | null }): Promise<{ providerMessageId: string | null }>;
}

/** No provider configured: record the message and write it to the log. */
export class LogTransport implements MailTransport {
  readonly name = "log";

  async deliver(message: MailMessage, envelope: { to: string; from: string }): Promise<{ providerMessageId: string | null }> {
    logger.info(
      { kind: message.kind, to: envelope.to, from: envelope.from, subject: message.subject, body: message.text },
      "Mail not configured — message logged instead of sent"
    );
    return { providerMessageId: null };
  }
}

export class SendGridTransport implements MailTransport {
  readonly name = "sendgrid";

  constructor(private readonly apiKey: string, private readonly sandbox: boolean) {}

  async deliver(
    message: MailMessage,
    envelope: { to: string; from: string; fromName: string; replyTo: string | null }
  ): Promise<{ providerMessageId: string | null }> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: envelope.to }] }],
        from: { email: envelope.from, name: envelope.fromName },
        ...(envelope.replyTo ? { reply_to: { email: envelope.replyTo } } : {}),
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
        categories: [`sender:${message.sender}`, `kind:${message.kind}`],
        // Click tracking rewrites URLs. A single-use token link that has been
        // rewritten is a different link, so both kinds of tracking stay off.
        tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
        ...(this.sandbox ? { mail_settings: { sandbox_mode: { enable: true } } } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`SendGrid rejected the message (${res.status}) ${detail.slice(0, 300)}`);
    }
    return { providerMessageId: res.headers.get("x-message-id") };
  }
}

/** Captures everything instead of sending it. Used by the tests. */
export class MemoryTransport implements MailTransport {
  readonly name = "memory";
  readonly sent: { message: MailMessage; to: string; from: string }[] = [];

  async deliver(message: MailMessage, envelope: { to: string; from: string }): Promise<{ providerMessageId: string | null }> {
    this.sent.push({ message, to: envelope.to, from: envelope.from });
    return { providerMessageId: `memory-${this.sent.length}` };
  }
}

export class Mailer {
  constructor(private readonly db: Db, private readonly config: AppConfig, private readonly transport: MailTransport) {}

  get transportName(): string {
    return this.transport.name;
  }

  /** Absolute link into the app, when APP_BASE_URL is set; a path otherwise. */
  link(path: string): string {
    const base = this.config.appBaseUrl;
    return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path;
  }

  async send(message: MailMessage, options: SendOptions): Promise<SendResult> {
    const sender = MAIL_SENDERS[message.sender];
    const domain = this.config.mail.fromDomain;
    const recipient = this.config.mail.redirectAllTo ?? options.to;
    const from = `${sender.localPart}@${domain}`;
    const replyTo = sender.replyTo ? `${sender.replyTo}@${domain}` : null;

    // A template that may carry PHI cannot go out until a BAA is in place.
    // It is recorded, not thrown: the caller's job is not the right place to
    // fail over a policy decision made elsewhere.
    if (message.phi && !this.config.mail.baaSignedAllVendors) {
      const id = await this.record(message, recipient, "blocked_phi", options, null, "No signed BAA for the mail provider.");
      logger.warn({ kind: message.kind }, "Message withheld: template may carry PHI and no BAA is recorded");
      return { status: "blocked_phi", id };
    }

    // Reserve first when the caller asked for idempotence.
    let rowId: string | null = null;
    if (options.dedupeKey) {
      try {
        rowId = await this.record(message, recipient, "pending", options, null, null);
      } catch (e) {
        if (isUniqueViolation(e)) return { status: "deduped", id: null };
        throw e;
      }
    }

    try {
      const { providerMessageId } = await this.transport.deliver(message, {
        to: recipient,
        from,
        fromName: sender.displayName,
        replyTo,
      });
      const status: MailStatus = this.transport.name === "log" ? "logged" : "sent";
      rowId = await this.finish(rowId, message, recipient, status, options, providerMessageId, null);
      return { status, id: rowId };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      logger.error({ kind: message.kind, err: error }, "Mail delivery failed");
      rowId = await this.finish(rowId, message, recipient, "failed", options, null, error);
      return { status: "failed", id: rowId, error };
    }
  }

  private async record(
    message: MailMessage,
    recipient: string,
    status: MailStatus,
    options: SendOptions,
    providerMessageId: string | null,
    error: string | null
  ): Promise<string> {
    const [row] = await this.db
      .insert(mailOutboxTable)
      .values({
        kind: message.kind,
        sender: message.sender,
        recipient,
        subject: message.subject,
        status,
        providerMessageId,
        error,
        orgId: options.orgId ?? null,
        userId: options.userId ?? null,
        dedupeKey: options.dedupeKey ?? null,
      })
      .returning({ id: mailOutboxTable.id });
    return row!.id;
  }

  private async finish(
    rowId: string | null,
    message: MailMessage,
    recipient: string,
    status: MailStatus,
    options: SendOptions,
    providerMessageId: string | null,
    error: string | null
  ): Promise<string> {
    if (!rowId) return this.record(message, recipient, status, options, providerMessageId, error);
    await this.db.update(mailOutboxTable).set({ status, providerMessageId, error }).where(eq(mailOutboxTable.id, rowId));
    return rowId;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

export function createMailer(db: Db, config: AppConfig): Mailer {
  const transport =
    config.mail.mode === "sendgrid" && config.mail.apiKey
      ? new SendGridTransport(config.mail.apiKey, config.mail.sandbox)
      : new LogTransport();
  return new Mailer(db, config, transport);
}
