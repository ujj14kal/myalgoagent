import "server-only";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { sendEventEmail } from "@/lib/email";
import { logError } from "@/lib/logger";
import { EVENT_INFO, wantsEmail, type EventKind } from "@/lib/event-email-config";
import { siteUrl } from "@/lib/site";

// One place that turns an account event into an email: checks the user's settings, keeps a busy day from flooding an inbox,
// and never lets a mail problem break the thing that happened (a failed email is logged, nothing more).

export type EventMail = { subject: string; headline: string; body: string; path: string; linkLabel: string };

export async function emailEvent(userId: string, kind: EventKind, mail: EventMail): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, status: true, emailPrefs: true } });
    if (!user?.email || user.status !== "ACTIVE") return;
    if (!wantsEmail(user.emailPrefs, kind)) return;
    const info = EVENT_INFO[kind];
    try {
      await enforceRateLimit(`event-email:${userId}:${kind}`, info.max, info.windowMs);
    } catch (err) {
      if (err instanceof RateLimitError) return; // enough of these for now
      throw err;
    }
    await sendEventEmail(user.email, { subject: mail.subject, headline: mail.headline, body: mail.body, link: `${siteUrl}${mail.path}`, linkLabel: mail.linkLabel, live: kind.startsWith("live_") || kind === "broker_session" });
  } catch (err) {
    logError("event-email", err, { userId, kind });
  }
}
