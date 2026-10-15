import type { CustomIndicatorDef } from "./index";

// Rules of the community library, kept pure so they are tested on their own.

export const REPORTS_TO_HIDE = 3;
export const MAX_PUBLISHED_PER_USER = 10;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 600;
export const LIMITATIONS_MAX = 400;

/** Why this indicator can't be published, or null. A published indicator is public: nothing private may travel with it. */
export function publishProblem(def: CustomIndicatorDef, description: string): string | null {
  const text = description.trim();
  if (text.length < DESCRIPTION_MIN) return `Describe what it measures and how to read it (at least ${DESCRIPTION_MIN} characters), so others know what they are adding.`;
  if (text.length > DESCRIPTION_MAX) return `Keep the description under ${DESCRIPTION_MAX} characters.`;
  if (hasPrivateData(def)) return "This indicator reads one of your uploaded datasets, which are private. Publish one that doesn't use data(), or replace the dataset with a formula.";
  return null;
}

/** Whether the definition, or any indicator it is built on, carries an uploaded dataset. */
export function hasPrivateData(def: CustomIndicatorDef): boolean {
  if (def.data && Object.keys(def.data).length) return true;
  return Object.values(def.uses ?? {}).some(hasPrivateData);
}

/** Stars as a number with one decimal, or null before anyone has rated. */
export function averageRating(sum: number, count: number): number | null {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

/** Enough different people reported it that it comes down until the team has looked. */
export const shouldHide = (reports: number) => reports >= REPORTS_TO_HIDE;

export const validStars = (n: unknown): n is 1 | 2 | 3 | 4 | 5 => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
