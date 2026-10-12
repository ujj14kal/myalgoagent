// Rules for the Outreach page: who may send, to how many, and what counts as a valid message. Pure, so it is tested.

/** Addresses offered in the picker; any other address on our domain can still be typed. Extend with OUTREACH_SENDERS="addr|Name,addr|Name". */
export const DEFAULT_SENDERS = [
  { address: "support@myalgoagent.com", name: "MyAlgoAgent Support" },
  { address: "admin@myalgoagent.com", name: "MyAlgoAgent" },
  { address: "feedbacks@myalgoagent.com", name: "MyAlgoAgent" },
] as const;

export function sendersFrom(env: string | undefined): { address: string; name: string }[] {
  const out: { address: string; name: string }[] = DEFAULT_SENDERS.map((s) => ({ ...s }));
  for (const part of (env ?? "").split(",")) {
    const [address, name] = part.split("|").map((x) => x?.trim());
    if (address && isOurAddress(address) && !out.some((s) => s.address === address.toLowerCase())) out.push({ address: address.toLowerCase(), name: name || "MyAlgoAgent" });
  }
  return out;
}

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
export const isEmail = (s: string) => EMAIL.test(s) && s.length <= 254;
/** Only addresses on our own domain may be used as the sender. noreply@ is excluded: replies there become support cases. */
export const isOurAddress = (s: string) => isEmail(s) && /@myalgoagent\.com$/i.test(s) && !/^noreply@/i.test(s);

export const MAX_RECIPIENTS = 5;
export const MAX_BODY = 5_000;

/** Splits "a@x.com, b@y.com" (commas, semicolons, spaces or lines) into unique valid addresses, or says what is wrong. */
export function parseRecipients(raw: string): { ok: true; list: string[] } | { ok: false; error: string } {
  const parts = raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(parts)];
  if (!unique.length) return { ok: false, error: "Add at least one recipient." };
  const bad = unique.find((x) => !isEmail(x));
  if (bad) return { ok: false, error: `“${bad}” isn't a valid email address.` };
  if (unique.length > MAX_RECIPIENTS) return { ok: false, error: `Up to ${MAX_RECIPIENTS} recipients at a time — this is for personal messages, not bulk mail.` };
  return { ok: true, list: unique };
}
