import { escapeHtml as e, oneLine } from "@/lib/text";
import { logWarn } from "@/lib/logger";
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

export type OutgoingEmail = {
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
};

async function sendViaSes(m: OutgoingEmail): Promise<void> {
  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: m.from ?? FROM_ADDRESS,
      ConfigurationSetName: CONFIGURATION_SET,
      Destination: { ToAddresses: [m.to] },
      ReplyToAddresses: m.replyTo ? [m.replyTo] : undefined,
      Content: {
        Simple: {
          ...(m.headers ? { Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })) } : {}),
          Subject: { Data: m.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: m.html, Charset: "UTF-8" },
            Text: { Data: m.text, Charset: "UTF-8" },
          },
        },
      },
    }),
  );
}

/**
 * Google Workspace as a second route. Set GOOGLE_SMTP_HOST (default relay: smtp-relay.gmail.com, which trusts our fixed
 * outgoing address) or GOOGLE_SMTP_USER + GOOGLE_SMTP_PASS (an app password for a Workspace mailbox that has the sender
 * addresses as aliases). Nothing is configured → this route is off.
 */
export function googleConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.GOOGLE_SMTP_HOST || env.GOOGLE_SMTP_USER);
}

async function sendViaGoogle(m: OutgoingEmail): Promise<void> {
  const { createTransport } = await import("nodemailer");
  const user = process.env.GOOGLE_SMTP_USER;
  const transport = createTransport({
    host: process.env.GOOGLE_SMTP_HOST || (user ? "smtp.gmail.com" : "smtp-relay.gmail.com"),
    port: Number(process.env.GOOGLE_SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    ...(user ? { auth: { user, pass: process.env.GOOGLE_SMTP_PASS ?? "" } } : {}),
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transport.sendMail({ from: m.from ?? FROM_ADDRESS, to: m.to, replyTo: m.replyTo, subject: m.subject, html: m.html, text: m.text, headers: m.headers });
}

type Route = "ses" | "google";
type Sender = (m: OutgoingEmail) => Promise<void>;

/**
 * Which routes to try, in order. EMAIL_TRANSPORT = "ses" | "google" | "auto" (default). Auto tries Amazon SES first and, if SES
 * refuses (for example while the account is still in the SES sandbox and the recipient isn't verified), sends through Google
 * Workspace instead. When SES access is granted nothing needs changing: SES simply stops refusing.
 */
export function routesFor(setting: string | undefined, google: boolean): Route[] {
  if (setting === "ses") return ["ses"];
  if (setting === "google") return ["google"];
  return google ? ["ses", "google"] : ["ses"];
}

export async function deliver(m: OutgoingEmail, routes: Route[], senders: Record<Route, Sender>, onFallback?: (from: Route, err: unknown) => void): Promise<Route> {
  let last: unknown;
  for (let i = 0; i < routes.length; i++) {
    try {
      await senders[routes[i]](m);
      return routes[i];
    } catch (err) {
      last = err;
      if (i < routes.length - 1) onFallback?.(routes[i], err);
    }
  }
  throw last;
}

export async function sendEmail(m: OutgoingEmail): Promise<void> {
  const routes = routesFor(process.env.EMAIL_TRANSPORT, googleConfigured());
  const used = await deliver(m, routes, { ses: sendViaSes, google: sendViaGoogle }, (route, err) => {
    logWarn("email.fallback", `${route} refused, trying the next route`, { reason: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
  });
  if (used !== "ses") logWarn("email.route", `sent through ${used}`, {});
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

export async function sendWelcomeEmail(to: string, name: string, verifyUrl?: string) {
  const verify = verifyUrl ? `<p style="margin-top:20px">Please confirm this is your email address:</p>${emailButton(verifyUrl, "Confirm my email")}<p style="font-size:13px;color:#6b7788">The link works for 24 hours.</p>` : "";
  await sendEmail({
    to,
    subject: "Welcome to MyAlgoAgent",
    html: wrap(`<h1 style="font-size:20px;margin:0 0 12px">Welcome, ${e(name)}</h1><p>Your account is ready. Describe an idea in plain words, see the exact rules it becomes, and test it on past data before it goes anywhere near real money.</p>${emailButton(`${SITE}/app`, "Open MyAlgoAgent")}${verify}`, "Your account is ready"),
    text: `Hi ${name},\n\nWelcome to MyAlgoAgent — your account is ready: ${SITE}/app${verifyUrl ? `\n\nPlease confirm this is your email address (the link works for 24 hours): ${verifyUrl}` : ""}`,
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

const LIVE_NOTE = "This is an automatic alert about strategies you set up yourself. MyAlgoAgent gives no investment advice and does not trade on its own judgment; you are responsible for the orders in your broker account, and trading involves risk of loss.";

/** An alert about something that happened on the user's account. `note` is the small print under the message. */
export async function sendEventEmail(to: string, o: { subject: string; headline: string; body: string; link: string; linkLabel: string; live?: boolean }) {
  await sendEmail({
    to,
    subject: oneLine(o.subject, 200),
    html: wrap(
      `<h1 style="font-size:20px;margin:0 0 12px">${e(o.headline)}</h1><div style="white-space:pre-wrap">${e(o.body)}</div>${emailButton(o.link, o.linkLabel)}<p style="margin-top:20px;font-size:12px;color:#6b7788">${e(o.live ? LIVE_NOTE : "This is an automatic message about your account.")} You can choose which of these emails you get under <a href="${SITE}/app/agent-settings" style="color:${PURPLE}">Agent settings</a>.</p>`,
      o.headline,
    ),
    text: `${o.headline}\n\n${o.body}\n\n${o.linkLabel}: ${o.link}\n\n${o.live ? LIVE_NOTE : "This is an automatic message about your account."} Choose which of these emails you get: ${SITE}/app/agent-settings`,
    replyTo: "support@myalgoagent.com",
    headers: { "List-Unsubscribe": `<${SITE}/app/agent-settings>, <mailto:support@myalgoagent.com?subject=Stop%20alert%20emails>`, "X-Auto-Response-Suppress": "OOF, AutoReply" },
  });
}
