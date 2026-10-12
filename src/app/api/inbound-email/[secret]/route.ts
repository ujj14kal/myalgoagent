import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { simpleParser } from "mailparser";
import { handleInbound } from "@/lib/support/inbound";
import { logError, logWarn } from "@/lib/logger";

// Receives mail from SES via an SNS topic (SES receipt rule → SNS, with the message content included). The secret in the path
// keeps strangers out; SNS can't send headers. Always answers 200 for mail we deliberately skip so SNS doesn't keep retrying.
export const runtime = "nodejs";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const expected = process.env.INBOUND_EMAIL_SECRET;
  if (!expected || !same(secret, expected)) return new NextResponse("Not found", { status: 404 });

  let envelope: { Type?: string; SubscribeURL?: string; TopicArn?: string; Message?: string };
  try {
    envelope = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const topic = process.env.INBOUND_EMAIL_TOPIC_ARN;
  if (topic && envelope.TopicArn !== topic) return new NextResponse("Not found", { status: 404 });

  // SNS asks once to confirm the subscription: visit the URL it gives (only if it really is an Amazon SNS address).
  if (envelope.Type === "SubscriptionConfirmation" && envelope.SubscribeURL) {
    const host = new URL(envelope.SubscribeURL).hostname;
    if (/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(host)) await fetch(envelope.SubscribeURL);
    return NextResponse.json({ ok: true });
  }
  if (envelope.Type !== "Notification" || !envelope.Message) return NextResponse.json({ ok: true });

  try {
    const note = JSON.parse(envelope.Message) as { content?: string; mail?: { messageId?: string } };
    if (!note.content) {
      logWarn("support.inbound", "notification without content", {});
      return NextResponse.json({ ok: true });
    }
    const mail = await simpleParser(note.content);
    const headers: Record<string, string> = {};
    mail.headers.forEach((v, k) => { headers[k.toLowerCase()] = typeof v === "string" ? v : typeof v === "object" && v && "text" in v ? String((v as { text: string }).text) : ""; });
    const sender = mail.from?.value[0];
    const result = await handleInbound({
      from: sender?.address ?? "",
      name: sender?.name ?? "",
      subject: mail.subject ?? "",
      text: mail.text ?? "",
      messageId: mail.messageId ?? note.mail?.messageId ?? "",
      headers,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError("support.inbound", err, {});
    return NextResponse.json({ error: "Could not process" }, { status: 500 });
  }
}
