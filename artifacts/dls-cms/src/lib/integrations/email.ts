// lib/integrations/email.ts — SendGrid adapter + credential-expiry warnings.
// First transactional emails per the handoff: "your QMAP expires in 30
// days" at 30/14/3-day marks, deduped via notification_log. Live sending is
// gated on the BAA flag; demo mode logs instead of sending.
import "server-only";

import { isDemoMode } from "@/lib/demo/mode";
import { assertBaaGate } from "./hipaaGate";
import { listUsers } from "@/lib/data/repo-core";
import { isDuplicateNotification, recordNotification } from "@/lib/data/repo-notifications";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailAdapter {
  send(msg: EmailMessage): Promise<{ ok: boolean; error?: string }>;
}

class DemoEmailAdapter implements EmailAdapter {
  async send(msg: EmailMessage) {
    // DEMO: nothing leaves the process — the notification_log entry is the record.
    console.info(`[email:demo] to=${msg.to} subject="${msg.subject}"`);
    return { ok: true };
  }
}

class SendGridAdapter implements EmailAdapter {
  async send(msg: EmailMessage) {
    assertBaaGate("SendGrid");
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.SENDGRID_FROM_EMAIL;
    if (!key || !from) return { ok: false, error: "SendGrid not configured." };
    const sgMail = (await import("@sendgrid/mail")).default;
    sgMail.setApiKey(key);
    try {
      await sgMail.send({ to: msg.to, from, subject: msg.subject, text: msg.text });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export function getEmailAdapter(): EmailAdapter {
  if (isDemoMode() || !process.env.SENDGRID_API_KEY) return new DemoEmailAdapter();
  return new SendGridAdapter();
}

const WARNING_DAYS = [30, 14, 3] as const;

/**
 * Credential-expiry sweep (run daily via cron/Replit scheduled job or the
 * admin button). Checks licenses + required trainings for every active
 * staff member; sends at the 30/14/3-day marks with dedupe.
 */
export async function runCredentialExpirySweep(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  const users = await listUsers();
  const adapter = getEmailAdapter();
  const today = new Date();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  const daysUntil = (iso: string) =>
    Math.ceil((new Date(`${iso}T12:00:00`).getTime() - today.getTime()) / 86400000);

  for (const user of users.filter((u) => u.status === "Active")) {
    const credentials: { kind: string; name: string; expires: string }[] = [];
    if (user.license_expiration_date) {
      credentials.push({ kind: "license", name: `License ${user.license_number ?? ""}`.trim(), expires: user.license_expiration_date });
    }
    for (const t of user.training_completed) {
      if (t.expires_on && t.required !== false) {
        credentials.push({ kind: "training", name: t.course, expires: t.expires_on });
      }
    }

    for (const cred of credentials) {
      const days = daysUntil(cred.expires);
      const mark = WARNING_DAYS.find((w) => days <= w && days > (WARNING_DAYS[WARNING_DAYS.indexOf(w) + 1] ?? -Infinity));
      if (days < 0 || mark === undefined) continue;

      const dedupeKey = `credential_expiry_${mark}d:${user.id}:${cred.name}:${cred.expires}`;
      if (await isDuplicateNotification(dedupeKey)) {
        skipped++;
        continue;
      }
      const subject = `${cred.name} expires in ${days} day${days === 1 ? "" : "s"}`;
      const res = await adapter.send({
        to: user.email,
        subject,
        text:
          `Hi ${user.full_name.split(" ")[0]},\n\n` +
          `Your ${cred.name} expires on ${cred.expires} (${days} day${days === 1 ? "" : "s"} from now). ` +
          `Expired credentials block claims for your visits — please complete the renewal and have it recorded ` +
          `under Staff & credentials.\n\n— Durable Life Skills care management`
      });
      if (!res.ok) {
        errors.push(`${user.email}: ${res.error}`);
        continue;
      }
      await recordNotification({
        kind: `credential_expiry_${mark}d`,
        user_id: user.id,
        recipient_email: user.email,
        subject,
        dedupe_key: dedupeKey
      });
      sent++;
    }
  }
  return { sent, skipped, errors };
}
