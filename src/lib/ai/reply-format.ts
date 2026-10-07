// Groups an agent reply's text into paragraphs, lists and tables for the chat
// to render (never as raw HTML). Tables are read the way models actually
// write them: with or without the outer pipes, with alignment colons in the
// rule line, ragged rows, and <br> inside cells.

export type Align = "left" | "center" | "right";

export type ReplyGroup =
  | { kind: "p"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; /** First number of an ordered list, so "4." after a paragraph stays 4. */ start: number; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][]; align: Align[] }
  /** A fenced ``` block: shown as-is (a formula or a rule), wrapping rather than running out of the bubble. */
  | { kind: "code"; text: string; lang?: string };

const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;
const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
/** The |---|:--:|---:| line under a table header. */
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$|^\s*\|\s*:?-{2,}:?\s*\|\s*$/;
/** A row written with outer pipes: | a | b |. */
const PIPED_ROW = /^\s*\|.*\|\s*$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n").trim());
}

function alignOf(rule: string): Align[] {
  return cells(rule).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
}

function makeTable(header: string[], body: string[][], align: Align[]): ReplyGroup {
  const width = Math.max(header.length, ...body.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(Math.max(0, width - r.length)).fill("")].slice(0, width);
  return { kind: "table", header: pad(header), rows: body.map(pad), align: pad(align as string[]).map((a) => (a || "left") as Align) };
}

export function groupReply(content: string): ReplyGroup[] {
  const groups: ReplyGroup[] = [];
  const lines = content.replace(/\r/g, "").split("\n");
  let para: Extract<ReplyGroup, { kind: "p" }> | null = null;
  let list: Extract<ReplyGroup, { kind: "list" }> | null = null;
  let blank = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A fenced code block runs to its closing fence (or the end of the reply); its lines are kept exactly.
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length && !/^\s*```\s*$/.test(lines[j]); j++) body.push(lines[j]);
      const text = body.join("\n").replace(/^\n+|\s+$/g, "");
      if (text) groups.push({ kind: "code", text, ...(fence[1] ? { lang: fence[1] } : {}) });
      para = list = null;
      blank = false;
      i = j;
      continue;
    }
    if (!line.trim()) {
      blank = true;
      para = null;
      continue;
    }
    const wasBlank = blank;
    blank = false;

    // Tables: a header line with pipes followed by a rule line (outer pipes
    // optional), or a run of rows that all have outer pipes. Blank lines
    // between rows are skipped.
    const nextIdx = lines.findIndex((l, k) => k > i && l.trim());
    const next = nextIdx > -1 ? lines[nextIdx] : undefined;
    const tableStart = line.includes("|") && next !== undefined && TABLE_RULE.test(next);
    if (tableStart || (PIPED_ROW.test(line) && !TABLE_RULE.test(line) && next !== undefined && PIPED_ROW.test(next))) {
      const header = cells(line);
      const align = tableStart ? alignOf(next!) : [];
      const body: string[][] = [];
      let j = tableStart ? nextIdx + 1 : i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) {
          const after = lines.slice(j + 1).find((x) => x.trim());
          if (after && PIPED_ROW.test(after)) continue;
          break;
        }
        if (TABLE_RULE.test(l)) continue;
        if (!(tableStart ? l.includes("|") : PIPED_ROW.test(l))) break;
        body.push(cells(l));
      }
      groups.push(makeTable(header, body, align));
      para = list = null;
      i = j - 1;
      continue;
    }
    if (TABLE_RULE.test(line)) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      groups.push({ kind: "heading", text: heading[1] });
      para = list = null;
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /^\s*\d/.test(line);
      const n = ordered ? parseInt(line, 10) : 1;
      // Continue the same list across blank lines or a note in between ("3. … <note> 4. …").
      const continues = list && list.ordered === ordered && (!ordered || n === list.start + list.items.length);
      if (!continues) {
        // A new list keeps the number it was written with ("3." after a note stays 3).
        list = { kind: "list", ordered, start: ordered ? n : 1, items: [] };
        groups.push(list);
      }
      list!.items.push(line.replace(LIST_ITEM, ""));
      para = null;
      continue;
    }

    // An indented line right after a list item (even after a blank line) belongs to that item.
    if (list && /^\s{2,}/.test(line) && (para === null || !wasBlank)) {
      list.items[list.items.length - 1] += "\n" + line.trim();
      continue;
    }

    list = null;
    if (!para) {
      para = { kind: "p", lines: [] };
      groups.push(para);
    }
    para.lines.push(line);
  }
  return groups;
}
