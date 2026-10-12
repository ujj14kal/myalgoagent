import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";

// "Confirm my email": a one-time link in the welcome email. Only a hash of the token is stored; the link works for 24 hours.

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const identifierFor = (email: string) => `verify:${email.toLowerCase()}`;

/** Makes a fresh link for this address (replacing any earlier one). */
export async function newVerifyUrl(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const identifier = identifierFor(email);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({ data: { identifier, token: sha(token), expires: new Date(Date.now() + 24 * 3_600_000) } });
  return `${siteUrl}/api/verify-email?email=${encodeURIComponent(email.toLowerCase())}&token=${token}`;
}

/** Uses the link: true when the address is now confirmed. */
export async function confirmEmail(email: string, token: string): Promise<boolean> {
  const identifier = identifierFor(email);
  const row = await prisma.verificationToken.findUnique({ where: { identifier_token: { identifier, token: sha(token) } } });
  if (!row) return false;
  await prisma.verificationToken.delete({ where: { identifier_token: { identifier, token: row.token } } });
  if (row.expires.getTime() < Date.now()) return false;
  const res = await prisma.user.updateMany({ where: { email: email.toLowerCase(), emailVerified: null }, data: { emailVerified: new Date() } });
  return res.count > 0 || !!(await prisma.user.findFirst({ where: { email: email.toLowerCase(), emailVerified: { not: null } }, select: { id: true } }));
}
