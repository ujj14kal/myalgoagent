// Cleaning and checking the API keys users paste. Broker key formats vary a
// lot — Groww's API key is a long JWT, ICICI Breeze secrets contain symbols
// like "~", Fyers app IDs end in "-100" — so any printable, space-free text up
// to 4 KB is accepted; the broker itself is the real check.

export class KeyInputError extends Error {}

/** Invisible characters that copy-paste can add (zero-width spaces, BOM, NBSP). */
const INVISIBLE = /[​-‍⁠﻿ ]/g;

export function cleanKey(value: unknown, label: string, opts: { maxLength?: number; pattern?: RegExp } = {}): string {
  let v = (typeof value === "string" ? value : "").replace(INVISIBLE, "").trim();
  // Pasted with quotes around it (e.g. from a JSON file or chat).
  if (v.length >= 2 && /^(["'`]).*\1$/.test(v)) v = v.slice(1, -1).trim();
  if (!v) throw new KeyInputError(`Please paste your ${label}.`);
  if (/\s/.test(v)) throw new KeyInputError(`Your ${label} has a space or line break in it — copy it again from your broker in one piece.`);
  const max = opts.maxLength ?? 4096;
  if (v.length > max) throw new KeyInputError(`That ${label} is longer than expected — make sure you copied only the ${label}.`);
  if (!/^[\x21-\x7E]+$/.test(v) || (opts.pattern && !opts.pattern.test(v))) {
    throw new KeyInputError(`That ${label} doesn't look right — copy it again from your broker.`);
  }
  return v;
}
