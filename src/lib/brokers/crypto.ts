import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for broker API keys, secrets and access tokens at rest.
// The key lives only in the server runtime (BROKER_ENCRYPTION_KEY, 32 bytes
// base64) — never in the database, so a leaked DB dump alone reveals nothing.
// Each value is bound to its owner via additional authenticated data
// (userId + broker + field): a ciphertext copied into another user's row, or
// into a different column, fails to decrypt instead of being accepted.

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.BROKER_ENCRYPTION_KEY;
  if (!raw) throw new Error("BROKER_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("BROKER_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

export function brokerEncryptionReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export type SecretContext = { userId: string; broker: string; field: string };
const aad = (c: SecretContext) => Buffer.from(`${c.userId}|${c.broker}|${c.field}`, "utf8");

export function encryptSecret(plain: string, ctx: SecretContext): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(ctx));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decryptSecret(stored: string, ctx: SecretContext): string {
  const [version, iv, tag, body] = stored.split(":");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(aad(ctx));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
