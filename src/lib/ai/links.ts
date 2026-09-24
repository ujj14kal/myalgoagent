import { AGENT_PAGES } from "./system-prompt";

export type ReplyPart = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

export type ReplyBlock =
  | { kind: "text"; text: string }
  | { kind: "strategy"; fields: { label: string; value: string }[] }
  | { kind: "action"; href: string; label: string };

const ALLOWED = new Set(AGENT_PAGES.map((p) => p.path));
const LINK = /\[([^\]\n]{1,80})\]\(([^)\s]{1,200})\)/g;

/** True only for a known in-app path — the agent may never send the user off-site or to an unknown URL. */
export function isAllowedAgentLink(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return ALLOWED.has(path);
}

/**
 * Splits a reply into text and link parts. Markdown links to allowed pages
 * become links; any other link is reduced to its plain text, so a model
 * mistake or an injected URL can never become clickable.
 */
export function parseReplyLinks(reply: string): ReplyPart[] {
  const parts: ReplyPart[] = [];
  let last = 0;
  for (const m of reply.matchAll(LINK)) {
    const [whole, text, href] = m;
    const start = m.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: reply.slice(last, start) });
    parts.push(isAllowedAgentLink(href) ? { kind: "link", text, href } : { kind: "text", text });
    last = start + whole.length;
  }
  if (last < reply.length) parts.push({ kind: "text", text: reply.slice(last) });
  return parts;
}

const BLOCK = /\[\[strategy\]\]([\s\S]*?)\[\[\/strategy\]\]|\[\[go:([^|\]\s]{1,200})\|([^\]\n]{1,60})\]\]/g;

/**
 * Splits a reply into prose, strategy-draft cards and action buttons. Action
 * buttons only survive for allow-listed pages; anything else is dropped.
 */
export function parseReplyBlocks(raw: string): ReplyBlock[] {
  // Some models wrap the draft in a code fence; the card replaces the fence.
  const reply = raw.replace(/```[a-z]*\s*(\[\[strategy\]\][\s\S]*?\[\[\/strategy\]\])\s*```/g, "$1");
  const blocks: ReplyBlock[] = [];
  let last = 0;
  const pushText = (t: string) => {
    if (t.trim()) blocks.push({ kind: "text", text: t.trim() });
  };
  for (const m of reply.matchAll(BLOCK)) {
    const start = m.index ?? 0;
    pushText(reply.slice(last, start));
    if (m[1] !== undefined) {
      const fields = m[1]
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const i = l.indexOf(":");
          return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: "", value: l };
        });
      if (fields.length) blocks.push({ kind: "strategy", fields });
    } else if (isAllowedAgentLink(m[2])) {
      blocks.push({ kind: "action", href: m[2], label: m[3].trim() });
    }
    last = start + m[0].length;
  }
  pushText(reply.slice(last));
  return blocks;
}
