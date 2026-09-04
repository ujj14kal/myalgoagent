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
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: FROM_ADDRESS,
      Destination: { ToAddresses: [to] },
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
    html: wrap(`<p>Click below to sign in to MyAlgoAgent:</p><p><a href="${url}">Sign in</a></p><p>This link expires shortly and can only be used once. If you didn't request this, you can ignore this email.</p>`),
    text: `Sign in to MyAlgoAgent: ${url}\n\nThis link expires shortly and can only be used once. If you didn't request this, you can ignore this email.`,
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  await sendEmail({
    to,
    subject: "Welcome to MyAlgoAgent",
    html: wrap(`<p>Hi ${name},</p><p>Welcome to MyAlgoAgent — your account is ready.</p>`),
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
    html: wrap(`<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`),
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
    subject: `New feedback from ${page}`,
    html: wrap(`<p>From: ${fromEmail}</p><p>Page: ${page}</p><p>${message}</p>`),
    text: `From: ${fromEmail}\nPage: ${page}\n\n${message}`,
  });
}

export async function sendSupportCaseNotice(caseId: string, subject: string, message: string, fromEmail: string) {
  await sendEmail({
    to: "support@myalgoagent.com",
    subject: `[${caseId}] ${subject}`,
    html: wrap(`<p>Case: ${caseId}</p><p>From: ${fromEmail}</p><p>Subject: ${subject}</p><p>${message}</p>`),
    text: `Case: ${caseId}\nFrom: ${fromEmail}\nSubject: ${subject}\n\n${message}`,
  });
}

export async function sendSupportCaseConfirmation(to: string, caseId: string) {
  await sendEmail({
    to,
    subject: `We received your request — ${caseId}`,
    html: wrap(`<p>Thanks for reaching out. Your case ID is <strong>${caseId}</strong>.</p><p>Our support team will follow up at this email address within 2–3 days.</p>`),
    text: `Thanks for reaching out. Your case ID is ${caseId}.\n\nOur support team will follow up at this email address within 2-3 days.`,
  });
}
