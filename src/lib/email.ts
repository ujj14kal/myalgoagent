import { escapeHtml as e, oneLine } from "@/lib/text";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const REGION = "ap-south-1";
const FROM_ADDRESS = "MyAlgoAgent <noreply@myalgoagent.com>";
/** Anything a person may answer (support replies, case confirmations) comes from here, so a reply reaches a real inbox. */
/** SES configuration set: reports bounces and complaints (to an alert topic) and feeds the reputation alarms. */
const CONFIGURATION_SET = "myalgoagent-transactional";
export const SUPPORT_FROM = "MyAlgoAgent Support <support@myalgoagent.com>";

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
  from,
  headers,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where a reply should actually go — e.g. the user who submitted feedback,
   * so replying from an inbox reaches them instead of bouncing off noreply@. */
  replyTo?: string;
  /** Sender; defaults to the no-reply address. */
  from?: string;
  /** Extra mail headers, e.g. Auto-Submitted on automatic replies so other systems don't answer them. */
  headers?: Record<string, string>;
}): Promise<void> {
  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: from ?? FROM_ADDRESS,
      ConfigurationSetName: CONFIGURATION_SET,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      Content: {
        Simple: {
          ...(headers ? { Headers: Object.entries(headers).map(([Name, Value]) => ({ Name, Value })) } : {}),
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

const SITE = "https://myalgoagent.com";
const NAVY = "#0e1b2d";
const PURPLE = "#471898";

/** A call-to-action button (works in Gmail, Outlook and phones: a padded link, not a styled <button>). */
export function emailButton(url: string, label: string): string {
  return `<p style="margin:24px 0 8px"><a href="${e(url)}" style="display:inline-block;background:${PURPLE};color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">${e(label)}</a></p>`;
}

/** The big monospaced code box for one-time codes. */
export function emailCode(code: string): string {
  return `<p style="margin:20px 0;padding:16px;background:#f3f0fb;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:${PURPLE};font-family:Menlo,Consolas,monospace">${e(code)}</p>`;
}

/**
 * Every email we send goes through this one layout: brand header, a white card for the message, and a footer.
 * Table-based with inline styles because mail apps ignore most modern CSS. `preheader` is the grey preview line
 * shown next to the subject in the inbox.
 */
function wrap(body: string, preheader = ""): string {
  const pre = preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f7f9fc">${e(preheader)}</div>` : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f9fc">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY}">
<tr><td style="background:${NAVY};border-radius:16px 16px 0 0;padding:20px 28px">
<a href="${SITE}" style="text-decoration:none"><img src="${SITE}/brand/icon-64.png" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px"><span style="vertical-align:middle;margin-left:10px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px">MyAlgoAgent</span></a>
</td></tr>
<tr><td style="background:#ffffff;padding:32px 28px;font-size:15px;line-height:1.6;border-left:1px solid #e6eaf0;border-right:1px solid #e6eaf0">${body}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e6eaf0;border-top:0;border-radius:0 0 16px 16px;padding:0 28px 24px">
<div style="border-top:1px solid #e6eaf0;padding-top:16px;font-size:12px;line-height:1.6;color:#6b7788">
Questions? Write to <a href="mailto:support@myalgoagent.com" style="color:${PURPLE}">support@myalgoagent.com</a> or visit <a href="${SITE}" style="color:${PURPLE}">myalgoagent.com</a>.<br>
MyAlgoAgent is a product of <a href="https://shagoonsoftech.com" style="color:#6b7788">Shagoon Softech Pvt. Ltd.</a> It is a tool for building and testing your own strategies; it gives no investment advice, and trading involves risk of loss.
</div></td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendMagicLinkEmail(to: string, url: string) {
  await sendEmail({
    to,
    subject: "Sign in to MyAlgoAgent",
    html: wrap(`<h1 style="font-size:20px;margin:0 0 12px">Sign in to MyAlgoAgent</h1><p>Use the button below to sign in. The link expires shortly and works once.</p>${emailButton(url, "Sign in")}<p style="font-size:13px;color:#6b7788">If you didn't ask for this, you can ignore this email.</p>`, "Your one-time sign-in link"),
    text: `Sign in to MyAlgoAgent: ${url}\n\nThis link expires shortly and can only be used once. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  await sendEmail({
    to,
    subject: "Welcome to MyAlgoAgent",
    html: wrap(`<h1 style="font-size:20px;margin:0 0 12px">Welcome, ${e(name)}</h1><p>Your account is ready. Describe an idea in plain words, see the exact rules it becomes, and test it on past data before it goes anywhere near real money.</p>${emailButton(`${SITE}/app`, "Open MyAlgoAgent")}`, "Your account is ready"),
    text: `Hi ${name},\n\nWelcome to MyAlgoAgent — your account is ready.`,
  });
}

export async function sendOtpEmail(to: string, code: string, purpose: string) {
  await sendEmail({
    to,
    subject: `Your MyAlgoAgent verification code: ${code}`,
    html: wrap(`<h1 style="font-size:20px;margin:0 0 12px">Your verification code</h1><p>Use this code for ${e(purpose)}:</p>${emailCode(code)}<p style="font-size:13px;color:#6b7788">It expires in 10 minutes. If you didn't ask for it, you can ignore this email. Never share this code with anyone.</p>`, `Your code is ${code}`),
    text: `Your verification code for ${purpose} is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail({
    to,
    subject: "Reset your MyAlgoAgent password",
    html: wrap(`<h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1><p>We received a request to reset your password.</p>${emailButton(resetUrl, "Choose a new password")}<p style="font-size:13px;color:#6b7788">The link expires in 1 hour. If you didn't ask for this, you can ignore this email.</p>`, "Choose a new password"),
    text: `We received a request to reset your password.\n\nReset it here: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendDeletionConfirmedEmail(to: string, scheduledFor: Date) {
  const dateStr = scheduledFor.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" });
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
    from: SUPPORT_FROM,
    replyTo: "support@myalgoagent.com",
  });
}

/** A reply from our team to a support case or piece of feedback. */
export async function sendSupportReplyEmail(to: string, opts: { ref: string; topic: string; body: string; staffName: string; threadUrl: string | null }) {
  const subject = oneLine(`Re: ${opts.topic} [${opts.ref}]`, 250);
  const view = opts.threadUrl
    ? `${emailButton(opts.threadUrl, "View and reply on MyAlgoAgent")}`
    : `<p>You can reply to this email to continue the conversation.</p>`;
  await sendEmail({
    to,
    subject,
    html: wrap(
      `<p style="color:#666;font-size:13px">${e(opts.ref)} · ${e(opts.topic)}</p><div style="white-space:pre-wrap;border-left:3px solid #471898;padding-left:12px">${e(opts.body)}</div><p style="margin-top:16px">— ${e(opts.staffName)}, MyAlgoAgent support</p>${view}`,
    ),
    text: `${opts.ref} · ${opts.topic}\n\n${opts.body}\n\n— ${opts.staffName}, MyAlgoAgent support\n\n${opts.threadUrl ? `View and reply: ${opts.threadUrl}` : "Reply to this email to continue the conversation."}`,
    from: SUPPORT_FROM,
    replyTo: "support@myalgoagent.com",
  });
}

/** A service notice to every user (maintenance, changes to the service or terms) — never marketing. */
export async function sendAnnouncementEmail(to: string, opts: { title: string; body: string; link: string | null }) {
  await sendEmail({
    to,
    subject: oneLine(opts.title, 200),
    html: wrap(`<h1 style="font-size:20px;margin:0 0 12px">${e(opts.title)}</h1><div style="white-space:pre-wrap">${e(opts.body)}</div>${opts.link ? emailButton(opts.link, "Learn more") : ""}`, opts.title),
    text: `${opts.title}\n\n${opts.body}${opts.link ? `\n\n${opts.link}` : ""}`,
  });
}

/**
 * The automatic answer to someone who wrote to the no-reply address: that mailbox isn't read, but their message has become a case.
 * Marked as automatic so mail systems never answer it (no loops).
 */
export async function sendInboundAck(to: string, ref: string, topic: string, addedToExisting: boolean) {
  const lead = addedToExisting
    ? `We've added your message to your existing request <strong>${e(ref)}</strong>.`
    : `We've opened a support request for you: <strong>${e(ref)}</strong>.`;
  await sendEmail({
    to,
    subject: oneLine(`Re: ${topic} [${ref}]`, 250),
    html: wrap(
      `<h1 style="font-size:20px;margin:0 0 12px">We got your message</h1><p>The address you wrote to (<em>noreply@myalgoagent.com</em>) is automatic and nobody reads it. ${lead}</p><p>Our support team will reply from <strong>support@myalgoagent.com</strong> within 2–3 days. To add anything, reply to our email and keep <strong>${e(ref)}</strong> in the subject.</p>${emailButton("https://myalgoagent.com/app/support", "See your requests")}<p style="font-size:13px;color:#6b7788">Your request number is ${e(ref)}. Quote it if you write again.</p>`,
      `Your request number is ${ref}`,
    ),
    text: `The address you wrote to (noreply@myalgoagent.com) is automatic and nobody reads it. ${addedToExisting ? `We've added your message to your existing request ${ref}.` : `We've opened a support request for you: ${ref}.`}\n\nOur support team will reply from support@myalgoagent.com within 2-3 days. To add anything, reply to our email and keep ${ref} in the subject.`,
    from: SUPPORT_FROM,
    replyTo: "support@myalgoagent.com",
    headers: { "Auto-Submitted": "auto-replied", Precedence: "bulk", "X-Auto-Response-Suppress": "All" },
  });
}
