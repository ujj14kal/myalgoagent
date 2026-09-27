import { describe, expect, it } from "vitest";
import { groupReply } from "./reply-format";

const tableOf = (s: string) => {
  const t = groupReply(s).find((g) => g.kind === "table");
  if (t?.kind !== "table") throw new Error("no table");
  return t;
};

describe("groupReply tables", () => {
  it("reads a standard markdown table with intro and outro text", () => {
    const g = groupReply("Here's the comparison:\n\n| Broker | Cost |\n|---|---|\n| Dhan | Free |\n| Zerodha | ₹500/mo |\n\nPick yours.");
    expect(g.map((x) => x.kind)).toEqual(["p", "table", "p"]);
    const t = tableOf("| Broker | Cost |\n|---|---|\n| Dhan | Free |\n| Zerodha | ₹500/mo |");
    expect(t.header).toEqual(["Broker", "Cost"]);
    expect(t.rows).toEqual([["Dhan", "Free"], ["Zerodha", "₹500/mo"]]);
  });

  it("reads tables without outer pipes, with alignment", () => {
    const t = tableOf("Metric | Value\n:--- | ---:\nCAGR | 12.4%\nMax drawdown | -8.1%");
    expect(t.header).toEqual(["Metric", "Value"]);
    expect(t.align).toEqual(["left", "right"]);
    expect(t.rows[1]).toEqual(["Max drawdown", "-8.1%"]);
  });

  it("keeps a table whole when rows sit directly under a sentence", () => {
    const g = groupReply("Your last backtests:\n| Strategy | Return |\n|---|---|\n| EMA | 8% |");
    expect(g.map((x) => x.kind)).toEqual(["p", "table"]);
  });

  it("joins rows separated by blank lines", () => {
    const t = tableOf("| A | B |\n|---|---|\n| 1 | 2 |\n\n| 3 | 4 |");
    expect(t.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("pads ragged rows and turns <br> into line breaks", () => {
    const t = tableOf("| Step | What to do | Where |\n|---|---|---|\n| 1 | Create app<br>Name it |\n| 2 | Paste URL | Dhan | extra |");
    expect(t.header.length).toBe(4);
    expect(t.rows[0]).toEqual(["1", "Create app\nName it", "", ""]);
  });

  it("still treats piped rows without a rule as a table", () => {
    expect(tableOf("| Name | Status |\n| Dhan | Connected |").rows).toEqual([["Dhan", "Connected"]]);
  });
});

describe("groupReply prose", () => {
  it("groups lists and headings", () => {
    const g = groupReply("### Steps\n1. Open Dhan\n2. Create app\n- note");
    expect(g.map((x) => x.kind)).toEqual(["heading", "list", "list"]);
  });

  it("keeps indented notes inside their numbered step and the numbering intact", () => {
    const g = groupReply("Steps:\n\n1. Open Dhan.\n2. Name it.\n3. Paste this URL:\n\n   `https://myalgoagent.com/api/brokers/dhan/callback`\n\n   (no trailing slash).\n4. Copy the key.\n\nReady?");
    expect(g.map((x) => x.kind)).toEqual(["p", "list", "p"]);
    const list = g[1];
    if (list.kind !== "list") throw new Error();
    expect(list.items).toHaveLength(4);
    expect(list.items[2]).toContain("dhan/callback");
    expect(list.items[2]).toContain("(no trailing slash)");
  });

  it("resumes numbering after a paragraph between steps", () => {
    const g = groupReply("1. One\n2. Two\n\nA note.\n\n3. Three");
    const last = g.at(-1);
    expect(last?.kind === "list" && last.start).toBe(3);
  });

  it("does not mistake a sentence with a pipe for a table", () => {
    expect(groupReply("Use RSI | MACD together").map((x) => x.kind)).toEqual(["p"]);
  });
});
