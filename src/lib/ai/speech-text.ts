// Turns an agent reply (markdown, tables, action buttons, strategy cards) into
// plain sentences that sound natural when read aloud. Pure — used on the
// server before Polly and in the browser for voice-mode captions.

const STRATEGY_BLOCK = /\[\[strategy\]\][\s\S]*?\[\[\/strategy\]\]/g;
const ACTION_BUTTON = /\[\[go:[^\]|]*\|[^\]]*\]\]/g;
const CODE_FENCE = /```[\s\S]*?```/g;

export function toSpeech(raw: string, maxChars = 2800): string {
  let text = raw
    .replace(CODE_FENCE, " ")
    .replace(STRATEGY_BLOCK, "\nI've drafted the strategy in the chat for you.\n")
    .replace(ACTION_BUTTON, " ");

  const out: string[] = [];
  let inTable = false;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("|")) {
      if (!inTable) out.push("I've put the details in a table in the chat.");
      inTable = true;
      continue;
    }
    inTable = false;
    if (!t) continue;
    const clean = t
      .replace(/^#{1,6}\s+/, "")
      .replace(/^([-*•]|\d+[.)])\s+/, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*|__|`/g, "")
      .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|[.,!?]|$)/g, "$1$2")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!clean) continue;
    // A list item or heading without closing punctuation becomes its own sentence.
    out.push(/[.!?:;]$/.test(clean) ? clean : `${clean}.`);
  }
  text = out.join(" ").replace(/\s+([.,!?])/g, "$1").trim();

  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${cut.slice(0, end > 0 ? end + 1 : maxChars)} The rest is in the chat.`;
}
