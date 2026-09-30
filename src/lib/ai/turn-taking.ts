// Pure helpers for natural voice conversation: when someone has finished a
// thought, and whether what the microphone heard is the agent's own voice.

/** Lower-cased words of a transcript, without punctuation. */
export function speechWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export const wordCount = (text: string) => speechWords(text).length;

/**
 * True when what the microphone heard is (mostly) the agent's own voice coming
 * back through the speakers — so it isn't treated as the user talking over it.
 */
export function isEcho(heard: string, spoken: string): boolean {
  const h = speechWords(heard);
  if (h.length === 0) return true;
  const said = new Set(speechWords(spoken));
  const fresh = h.filter((w) => !said.has(w)).length;
  return fresh / h.length <= 0.34;
}

const TRAILING = new Set(["and", "but", "or", "so", "then", "with", "the", "a", "an", "on", "for", "to", "of", "in", "if", "when", "because", "also", "like", "my", "at"]);

/**
 * How long to wait after a finished phrase before treating it as the end of the
 * turn. Short when it sounds complete (a question, a full sentence), longer when it
 * sounds unfinished — and speaking again always cancels the wait.
 */
export function endOfTurnDelay(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const words = speechWords(t);
  const last = words[words.length - 1] ?? "";
  if (TRAILING.has(last) || /[,;:]$/.test(t)) return 1100;
  if (/\?$/.test(t)) return 350;
  if (/[.!]$/.test(t)) return words.length <= 2 ? 650 : 450;
  return 800;
}
