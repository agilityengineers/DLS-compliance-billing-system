// What the system may send, and which desk it goes out from.
//
// Two rules are enforced by shape rather than by discipline:
//
//   · The SENDER IS A PROPERTY OF THE TEMPLATE, never an argument. An
//     invitation therefore cannot leave from the partnerships address by
//     mistake, however the calling code is refactored.
//   · Every template declares whether it can carry PHI. Nothing shipped here
//     does: each message says what kind of thing happened and links into the
//     portal, the way a bank tells you "a payment was made" and makes you sign
//     in for the amount. Until a Business Associate Agreement is signed with
//     the mail provider, that is not a style preference but the condition
//     that makes mail safe to switch on at all.
//
// The desk mapping follows docs/review/email-senders.md.

export const MAIL_SENDERS = {
  noreply: { localPart: "noreply", displayName: "Durable Life Skills", replyTo: null },
  staff: { localPart: "staff", displayName: "DLS Staff Office", replyTo: "staff" },
  schedule: { localPart: "schedule", displayName: "DLS Scheduling", replyTo: "schedule" },
  partner: { localPart: "partner", displayName: "Durable Life Skills Partnerships", replyTo: "partner" },
} as const;

export type MailSenderKey = keyof typeof MAIL_SENDERS;

export interface MailMessage {
  /** Template key; also the dedupe and reporting label. */
  kind: string;
  sender: MailSenderKey;
  subject: string;
  text: string;
  html: string;
  /** True only for a template that may name a client. None do yet. */
  phi: boolean;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Block {
  heading: string;
  lines: string[];
  action?: { label: string; url: string };
  footer?: string;
}

/**
 * One layout for every message: a heading, a few lines, an optional button.
 * Inline styles only, no remote images — an email client that blocks both
 * still shows a readable message, and nothing phones home when it is opened.
 */
function render(block: Block): { text: string; html: string } {
  const text = [
    block.heading,
    "",
    ...block.lines,
    ...(block.action ? ["", `${block.action.label}: ${block.action.url}`] : []),
    ...(block.footer ? ["", block.footer] : []),
  ].join("\n");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2B2438;max-width:560px">
  <h1 style="font-family:Georgia,serif;font-size:20px;color:#4A3D63;margin:0 0 16px">${escapeHtml(block.heading)}</h1>
  ${block.lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join("\n  ")}
  ${
    block.action
      ? `<p style="margin:24px 0"><a href="${escapeHtml(block.action.url)}" style="background:#5F7161;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">${escapeHtml(block.action.label)}</a></p>
  <p style="margin:0 0 12px;color:#716B80;font-size:13px">If the button does not work, paste this into your browser:<br>${escapeHtml(block.action.url)}</p>`
      : ""
  }
  ${block.footer ? `<p style="margin:24px 0 0;color:#716B80;font-size:13px">${escapeHtml(block.footer)}</p>` : ""}
</div>`;
  return { text, html };
}

const NO_REPLY_FOOTER = "This message was sent automatically by the DLS Portal. Nobody reads replies to this address.";

export function inviteEmail(input: {
  fullName: string;
  orgName: string;
  roleLabel: string;
  link: string;
  expiresAt: Date;
}): MailMessage {
  const body = render({
    heading: `Your ${input.orgName} account is ready`,
    lines: [
      `Hello ${input.fullName},`,
      `An account has been created for you at ${input.orgName} as ${input.roleLabel}.`,
      "Choose a password to finish setting it up. The link below works once.",
      `It expires on ${input.expiresAt.toDateString()}.`,
    ],
    action: { label: "Set your password", url: input.link },
    footer: NO_REPLY_FOOTER,
  });
  return { kind: "account.invite", sender: "noreply", subject: `Set up your ${input.orgName} account`, phi: false, ...body };
}

export function passwordResetEmail(input: { fullName: string; link: string; expiresAt: Date }): MailMessage {
  const body = render({
    heading: "Reset your password",
    lines: [
      `Hello ${input.fullName},`,
      "Someone asked to reset the password for this account. The link below works once and expires shortly.",
      `It expires at ${input.expiresAt.toUTCString()}.`,
      "If this was not you, you can ignore this message — your password has not changed.",
    ],
    action: { label: "Choose a new password", url: input.link },
    footer: NO_REPLY_FOOTER,
  });
  return { kind: "account.password_reset", sender: "noreply", subject: "Reset your DLS Portal password", phi: false, ...body };
}

export function passwordChangedEmail(input: { fullName: string; at: Date }): MailMessage {
  const body = render({
    heading: "Your password was changed",
    lines: [
      `Hello ${input.fullName},`,
      `The password on your DLS Portal account was changed on ${input.at.toUTCString()}.`,
      "Every other device was signed out. If this was not you, contact your administrator straight away.",
    ],
    footer: NO_REPLY_FOOTER,
  });
  return { kind: "account.password_changed", sender: "noreply", subject: "Your DLS Portal password was changed", phi: false, ...body };
}

export function sessionsRevokedEmail(input: { fullName: string; by: string }): MailMessage {
  const body = render({
    heading: "You were signed out everywhere",
    lines: [
      `Hello ${input.fullName},`,
      `${input.by} signed your account out of every device.`,
      "Your password has not changed — sign in again when you are ready.",
    ],
    footer: NO_REPLY_FOOTER,
  });
  return { kind: "account.sessions_revoked", sender: "noreply", subject: "You were signed out of the DLS Portal", phi: false, ...body };
}

export function accountSuspendedEmail(input: { fullName: string; orgName: string }): MailMessage {
  const body = render({
    heading: "Your account has been suspended",
    lines: [
      `Hello ${input.fullName},`,
      `Your ${input.orgName} account has been suspended and can no longer sign in.`,
      "If you think this is a mistake, contact your administrator.",
    ],
    footer: NO_REPLY_FOOTER,
  });
  return { kind: "account.suspended", sender: "noreply", subject: "Your DLS Portal account was suspended", phi: false, ...body };
}

export function supportWindowRequestedEmail(input: {
  adminName: string;
  requesterName: string;
  orgName: string;
  reason: string;
  link: string;
}): MailMessage {
  const body = render({
    heading: "Support access has been requested",
    lines: [
      `Hello ${input.adminName},`,
      `${input.requesterName} has asked for a support window on ${input.orgName}.`,
      `Reason given: ${input.reason}`,
      "Nobody can see your records until you grant a window, and any window you grant ends by itself.",
    ],
    action: { label: "Review the request", url: input.link },
    footer: NO_REPLY_FOOTER,
  });
  return {
    kind: "support.window_requested",
    sender: "noreply",
    subject: `Support access requested for ${input.orgName}`,
    phi: false,
    ...body,
  };
}

export function credentialExpiryEmail(input: {
  fullName: string;
  requirementLabel: string;
  expiresOn: string;
  daysRemaining: number;
  link: string;
}): MailMessage {
  const when =
    input.daysRemaining <= 0
      ? `expired on ${input.expiresOn}`
      : `expires in ${input.daysRemaining} day${input.daysRemaining === 1 ? "" : "s"}, on ${input.expiresOn}`;
  const body = render({
    heading: `${input.requirementLabel} ${input.daysRemaining <= 0 ? "has expired" : "is expiring"}`,
    lines: [
      `Hello ${input.fullName},`,
      `Your ${input.requirementLabel} ${when}.`,
      "An expired credential stops visits being billed, so please renew it and send the certificate to the office.",
    ],
    action: { label: "Open the portal", url: input.link },
  });
  return {
    kind: "staff.credential_expiry",
    sender: "staff",
    subject: `${input.requirementLabel} ${input.daysRemaining <= 0 ? "has expired" : `expires in ${input.daysRemaining} days`}`,
    phi: false,
    ...body,
  };
}

export function baaExpiringEmail(input: {
  adminName: string;
  orgName: string;
  expiresOn: string;
  daysRemaining: number;
}): MailMessage {
  const body = render({
    heading: "Business Associate Agreement is expiring",
    lines: [
      `Hello ${input.adminName},`,
      `The Business Associate Agreement recorded for ${input.orgName} ${
        input.daysRemaining <= 0 ? `lapsed on ${input.expiresOn}` : `expires on ${input.expiresOn}, in ${input.daysRemaining} days`
      }.`,
      "Renewing it keeps the portal's use of client data on a proper footing.",
    ],
  });
  return {
    kind: "org.baa_expiring",
    sender: "partner",
    subject: `BAA for ${input.orgName} ${input.daysRemaining <= 0 ? "has lapsed" : "expires soon"}`,
    phi: false,
    ...body,
  };
}
