"use server";

import { assertStaff, StaffError } from "@/lib/admin/access";
import { audit } from "@/lib/admin/audit";
import { outreachHtml, sendOutreachEmail } from "@/lib/email";
import { isOurAddress, MAX_BODY, parseRecipients, sendersFrom } from "@/lib/admin/outreach";
import { checkRateLimit } from "@/lib/rate-limit";
import { oneLine, text } from "@/lib/text";
import { logError } from "@/lib/logger";

export type OutreachInput = { from: string; senderName: string; senderRole: string; to: string; subject: string; body: string };
export type OutreachResult = { ok: true; message: string; html?: string } | { ok: false; error: string };

function clean(input: OutreachInput) {
  const from = (input.from ?? "").trim().toLowerCase();
  const senderName = oneLine(input.senderName ?? "", 60) || sendersFrom(process.env.OUTREACH_SENDERS).find((s) => s.address === from)?.name || "MyAlgoAgent";
  const senderRole = oneLine(input.senderRole ?? "", 80);
  const subject = oneLine(input.subject ?? "", 150);
  const body = text(input.body ?? "");
  if (!isOurAddress(from)) return { ok: false, error: "Choose a sending address on myalgoagent.com (not noreply@)." } as const;
  if (!subject) return { ok: false, error: "Add a subject." } as const;
  if (!body) return { ok: false, error: "Write your message." } as const;
  if (body.length > MAX_BODY) return { ok: false, error: `Keep it under ${MAX_BODY.toLocaleString("en-IN")} characters.` } as const;
  return { ok: true, from, senderName, senderRole, subject, body } as const;
}

/** What the email will look like, without sending anything. */
export async function previewOutreach(input: OutreachInput): Promise<OutreachResult> {
  try {
    await assertStaff("outreach");
    const c = clean(input);
    if (!c.ok) return { ok: false, error: c.error };
    return { ok: true, message: "Preview", html: outreachHtml({ body: c.body, senderName: c.senderName, senderRole: c.senderRole, fromAddress: c.from }) };
  } catch (err) {
    return fail(err);
  }
}

/** Sends the message to each recipient separately (or only to the signed-in staff member when `testToMe` is set). */
export async function sendOutreach(input: OutreachInput, testToMe: boolean): Promise<OutreachResult> {
  try {
    const staff = await assertStaff("outreach");
    const c = clean(input);
    if (!c.ok) return { ok: false, error: c.error };
    const parsed = testToMe ? ({ ok: true, list: [staff.email] } as const) : parseRecipients(input.to ?? "");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const limited = await checkRateLimit(`outreach:${staff.id}`, 40, 24 * 3_600_000);
    if (limited && !testToMe) return { ok: false, error: "That's a lot of outreach for one day — carry on tomorrow so your address stays in good standing." };
    const results: string[] = [];
    let sent = 0;
    for (const to of parsed.list) {
      try {
        await sendOutreachEmail(to, { subject: c.subject, body: c.body, senderName: c.senderName, senderRole: c.senderRole, fromAddress: c.from });
        sent++;
        results.push(`✓ ${to}`);
      } catch (err) {
        logError("admin.outreach", err, { to });
        results.push(`✗ ${to}: ${err instanceof Error ? err.message.slice(0, 120) : "failed"}`);
      }
    }
    await audit(staff, testToMe ? "outreach.test" : "outreach.send", null, `${testToMe ? "Test of" : "Sent"} “${c.subject}” from ${c.from} to ${parsed.list.join(", ")}`, { from: c.from, subject: c.subject, to: parsed.list, sent });
    if (!sent) return { ok: false, error: `Nothing was sent. ${results.join(" · ")}` };
    return { ok: true, message: `${testToMe ? "Test sent to you" : `Sent ${sent} of ${parsed.list.length}`}. ${results.join(" · ")}` };
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown): OutreachResult {
  if (err instanceof StaffError) return { ok: false, error: err.message };
  logError("admin.outreach", err);
  return { ok: false, error: "Something went wrong — it's been logged. Try again." };
}
