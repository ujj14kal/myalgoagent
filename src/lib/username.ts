import { prisma } from "@/lib/prisma";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (!isValidUsername(username)) return false;
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return !existing;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14);
}

/** Generates 3 available username suggestions derived from a display name/email. */
export async function suggestUsernames(seed: string): Promise<string[]> {
  const base = slugify(seed) || "trader";
  const suggestions: string[] = [];
  let attempts = 0;
  while (suggestions.length < 3 && attempts < 20) {
    attempts++;
    const suffix = Math.floor(100 + Math.random() * 900);
    const candidate = `${base}${suffix}`.slice(0, 20);
    if (isValidUsername(candidate) && !suggestions.includes(candidate) && (await isUsernameAvailable(candidate))) {
      suggestions.push(candidate);
    }
  }
  return suggestions;
}
