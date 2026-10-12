// Pure helpers for mail that people send us: which case it belongs to, whether it is a machine's message, and the new text without the quoted history.

/** The case number in a subject like "Re: Broker connection [MAA-100123]", or null. */
export function caseNumberIn(subject: string): number | null {
  const m = /\bMAA-(\d{6,})\b/i.exec(subject);
  if (!m) return null;
  const n = Number(m[1]) - 100000;
  return Number.isInteger(n) && n > 0 ? n : null;
}

const OWN_DOMAIN = /@(?:[a-z0-9-]+\.)*myalgoagent\.com$/i;
const MACHINE_SENDER = /^(?:mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce[s]?|notifications?)@/i;

/** Mail from a machine (auto-replies, bounces, our own addresses, mailing lists): answering it could start a loop, so it is dropped. */
export function isAutomated(from: string, headers: Record<string, string>): boolean {
  const h = (k: string) => (headers[k] ?? headers[k.toLowerCase()] ?? "").toLowerCase();
  if (OWN_DOMAIN.test(from) || MACHINE_SENDER.test(from)) return true;
  const auto = h("auto-submitted");
  if (auto && auto !== "no") return true;
  if (/bulk|junk|list|auto_reply/.test(h("precedence"))) return true;
  if (h("x-autoreply") || h("x-autorespond") || h("list-id") || h("list-unsubscribe")) return true;
  return false;
}

/** The fresh part of a reply: cuts at "On … wrote:", "-----Original Message-----", and a block of "> " quoted lines. */
export function freshText(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^On .{5,200}wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^From:\s.+/.test(line) && /^(Sent|Date):/.test(lines[i + 1] ?? "")) break;
    if (/^>/.test(line) && lines.slice(i, i + 3).every((l) => /^>|^\s*$/.test(l))) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** The subject without reply prefixes and our reference, for use as a new case's title. */
export function cleanSubject(subject: string): string {
  const s = subject.replace(/\[\s*MAA-\d+\s*\]/gi, "").replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim();
  return (s || "Email to MyAlgoAgent").slice(0, 200);
}
