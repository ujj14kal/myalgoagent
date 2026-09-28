import { createHmac } from "node:crypto";

// Time-based one-time codes (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits)
// — what an authenticator app shows. Used only for Groww's API TOTP key, a
// credential Groww issues for API access (not the user's account login 2FA).

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decodes an RFC 4648 base32 secret (spaces, dashes and padding ignored, any case). */
export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error("Not a base32 secret");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const isBase32Secret = (s: string) => {
  const clean = s.replace(/[\s-]/g, "").replace(/=+$/, "");
  return clean.length >= 16 && /^[A-Za-z2-7]+$/.test(clean);
};

/** The code for `timeMs` (default now). `digits` is 6 for every authenticator in practice. */
export function totpCode(secret: string, timeMs = Date.now(), digits = 6, stepSeconds = 30): string {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}
