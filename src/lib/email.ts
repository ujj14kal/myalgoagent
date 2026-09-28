import { escapeHtml as e, oneLine } from "@/lib/text";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const REGION = "ap-south-1";
const FROM_ADDRESS = "MyAlgoAgent <noreply@myalgoagent.com>";

let client: SESv2Client | null = null;
function getClient(): SESv2Client {
  if (!client) client = new SESv2Client({ region: REGION });
  return client;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where a reply should actually go — e.g. the user who submitted feedback,
   * so replying from an inbox reaches them instead of bouncing off noreply@. */
  replyTo?: string;
}): Promise<void> {
  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: FROM_ADDRESS,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text, Charset: "UTF-8" },
          },
        },
      },
    }),
  );
}

function wrap(body: string): string {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#0e1b2d;max-width:480px;margin:0 auto;padding:24px;">${body}<p style="margin-top:32px;font-size:12px;color:#888;">MyAlgoAgent — a product of Shagoon Softech Pvt. Ltd.</p></div>`;
}

export async function sendMagicLinkEmail(to: string, url: string) {
  await sendEmail({
    to,
    subject: "Sign in to MyAlgoAgent",
    html: wrap(`<p>Click below to sign in to MyAlgoAgent:</p><p><a href="${e(url)}">Sign in</a></p><p>This link expires shortly and can only be used once. If you didn't request this, you can ignore this email.</p>`),
    text: `Sign in to MyAlgoAgent: ${url}\n\nThis link expires shortly and can only be used once. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  await sendEmail({
    to,
    subject: "Welcome to MyAlgoAgent",
    html: wrap(`<p>Hi ${e(name)},</p><p>Welcome to MyAlgoAgent — your account is ready.</p>`),
    text: `Hi ${name},\n\nWelcome to MyAlgoAgent — your account is ready.`,
  });
}

export async function sendOtpEmail(to: string, code: string, purpose: string) {
  await sendEmail({
    to,
    subject: `Your MyAlgoAgent verification code: ${code}`,
    html: wrap(`<p>Your verification code for ${purpose} is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`),
    text: `Your verification code for ${purpose} is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail({
    to,
    subject: "Reset your MyAlgoAgent password",
    html: wrap(`<p>We received a request to reset your password.</p><p><a href="${e(resetUrl)}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`),
    text: `We received a request to reset your password.\n\nReset it here: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendDeletionConfirmedEmail(to: string, scheduledFor: Date) {
  const dateStr = scheduledFor.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  await sendEmail({
    to,
    subject: "Your MyAlgoAgent account deletion is scheduled",
    html: wrap(`<p>Your account has been scheduled for permanent deletion on <strong>${dateStr}</strong>.</p><p>If you log back in before then, deletion will be automatically cancelled and your account fully restored.</p>`),
    text: `Your account has been scheduled for permanent deletion on ${dateStr}.\n\nIf you log back in before then, deletion will be automatically cancelled and your account fully restored.`,
  });
}

export async function sendFeedbackNotice(page: string, message: string, fromEmail: string) {
  await sendEmail({
    to: "feedbacks@myalgoagent.com",
    subject: oneLine(`New feedback from ${page}`, 200),
    html: wrap(`<p>From: ${e(fromEmail)}</p><p>Page: ${e(page)}</p><p style="white-space:pre-wrap">${e(message)}</p>`),
    text: `From: ${fromEmail}\nPage: ${page}\n\n${message}`,
    // reply goes straight to the user who submitted it, not into noreply@
    replyTo: fromEmail,
  });
}

export async function sendSupportCaseNotice(caseId: string, subject: string, message: string, fromEmail: string) {
  await sendEmail({
    to: "support@myalgoagent.com",
    subject: oneLine(`[${caseId}] ${subject}`, 250),
    html: wrap(`<p>Case: ${e(caseId)}</p><p>From: ${e(fromEmail)}</p><p>Subject: ${e(subject)}</p><p style="white-space:pre-wrap">${e(message)}</p>`),
    text: `Case: ${caseId}\nFrom: ${fromEmail}\nSubject: ${subject}\n\n${message}`,
    replyTo: fromEmail,
  });
}

export async function sendSupportCaseConfirmation(to: string, caseId: string) {
  await sendEmail({
    to,
    subject: `We received your request — ${caseId}`,
    html: wrap(`<p>Thanks for reaching out. Your case ID is <strong>${caseId}</strong>.</p><p>Our support team will follow up at this email address within 2–3 days.</p>`),
    text: `Thanks for reaching out. Your case ID is ${caseId}.\n\nOur support team will follow up at this email address within 2-3 days.`,
    replyTo: "support@myalgoagent.com",
  });
}

/** A reply from our team to a support case or piece of feedback. */
export async function sendSupportReplyEmail(to: string, opts: { ref: string; topic: string; body: string; staffName: string; threadUrl: string | null }) {
  const subject = oneLine(`Re: ${opts.topic} [${opts.ref}]`, 250);
  const view = opts.threadUrl
    ? `<p style="margin-top:20px"><a href="${e(opts.threadUrl)}" style="display:inline-block;background:#471898;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">View and reply on MyAlgoAgent</a></p>`
    : `<p>You can reply to this email to continue the conversation.</p>`;
  await sendEmail({
    to,
    subject,
    html: wrap(
      `<p style="color:#666;font-size:13px">${e(opts.ref)} · ${e(opts.topic)}</p><div style="white-space:pre-wrap;border-left:3px solid #471898;padding-left:12px">${e(opts.body)}</div><p style="margin-top:16px">— ${e(opts.staffName)}, MyAlgoAgent support</p>${view}`,
    ),
    text: `${opts.ref} · ${opts.topic}\n\n${opts.body}\n\n— ${opts.staffName}, MyAlgoAgent support\n\n${opts.threadUrl ? `View and reply: ${opts.threadUrl}` : "Reply to this email to continue the conversation."}`,
    replyTo: "support@myalgoagent.com",
  });
}

/** A service notice to every user (maintenance, changes to the service or terms) — never marketing. */
export async function sendAnnouncementEmail(to: string, opts: { title: string; body: string; link: string | null }) {
  await sendEmail({
    to,
    subject: oneLine(opts.title, 200),
    html: wrap(`<h2 style="font-size:18px;margin:0 0 8px">${e(opts.title)}</h2><div style="white-space:pre-wrap">${e(opts.body)}</div>${opts.link ? `<p style="margin-top:16px"><a href="${e(opts.link)}">Learn more</a></p>` : ""}`),
    text: `${opts.title}\n\n${opts.body}${opts.link ? `\n\n${opts.link}` : ""}`,
  });
}
