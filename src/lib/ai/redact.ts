// Credentials pasted into the agent chat are hidden before the message is
// stored or sent to the model — a broker secret must never sit in chat
// history. Only the value is replaced, so the agent still sees that one was
// shared and can tell the user to regenerate it.

const HIDDEN = "[hidden secret]";

const LABELLED =
  /\b(api[\s_-]*(?:key|secret)|app[\s_-]*(?:id|secret)|secret(?:[\s_-]*(?:id|key))?|client[\s_-]*secret|access[\s_-]*token|auth[\s_-]*token|request[\s_-]*token|token|password|passcode|mpin|pin|otp|totp)(\s*(?:is|:|=|-|—)?\s*["'`]?)([^\s,;"'`]{6,})/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/** A value that looks like a real credential, not an ordinary word ("my pin is correct"). */
const looksSecret = (v: string) => /\d/.test(v) || v.length >= 12;

export function redactSecrets(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const out = text
    .replace(JWT, () => {
      redacted = true;
      return HIDDEN;
    })
    .replace(LABELLED, (whole, label: string, sep: string, value: string) => {
      if (value === HIDDEN || !looksSecret(value)) return whole;
      redacted = true;
      return `${label}${sep}${HIDDEN}`;
    });
  return { text: out, redacted };
}

/** Added to the model's copy of a message whose credential was hidden, so the reply always covers what to do. */
export const REDACTED_NOTE =
  "\n\n[System note: the user pasted a secret credential in this message and it was hidden. Tell them plainly that it's now exposed, so they should regenerate it on their broker's developer site, and paste the new one only on the Broker Connections page — never in chat.]";

/** The text to send the model for a user message. */
export function forModel(text: string): string {
  const r = redactSecrets(text);
  return r.redacted ? r.text + REDACTED_NOTE : r.text;
}
