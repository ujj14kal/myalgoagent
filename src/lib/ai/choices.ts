/** Splits a reply into its text and the “• …” lines the assistant offers as ready-made answers. */
export function splitChoices(text: string): { body: string; choices: string[] } {
  const choices: string[] = [];
  const body: string[] = [];
  // The chat page turns [[go:…]] into a button; here the review card already is the way forward.
  for (const line of text.replace(/\[\[go:[^\]]*\]\]/g, "").split(/\r?\n/)) {
    const m = /^\s*(?:[•\-*]|\d+[.)])\s+(.+)$/.exec(line);
    if (m && m[1].trim().length > 3) choices.push(m[1].replace(/\*\*/g, "").trim());
    else body.push(line);
  }
  return { body: body.join("\n").replace(/\n{3,}/g, "\n\n").trim(), choices: choices.slice(0, 5) };
}

