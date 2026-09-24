import { describe, expect, it } from "vitest";
import { isAllowedAgentLink, parseReplyBlocks, parseReplyLinks } from "./links";

describe("isAllowedAgentLink", () => {
  it("allows known in-app pages, with or without query/hash/trailing slash", () => {
    expect(isAllowedAgentLink("/app/backtests")).toBe(true);
    expect(isAllowedAgentLink("/app/backtests/")).toBe(true);
    expect(isAllowedAgentLink("/app/strategies/new?x=1")).toBe(true);
    expect(isAllowedAgentLink("/faq#paper-vs-live")).toBe(true);
  });

  it("rejects external, protocol-relative, script and unknown links", () => {
    expect(isAllowedAgentLink("https://evil.example")).toBe(false);
    expect(isAllowedAgentLink("//evil.example/app/backtests")).toBe(false);
    expect(isAllowedAgentLink("javascript:alert(1)")).toBe(false);
    expect(isAllowedAgentLink("/app/admin")).toBe(false);
  });
});

describe("parseReplyLinks", () => {
  it("turns allowed markdown links into link parts and keeps surrounding text", () => {
    expect(parseReplyLinks("Open [Backtests](/app/backtests) to run it.")).toEqual([
      { kind: "text", text: "Open " },
      { kind: "link", text: "Backtests", href: "/app/backtests" },
      { kind: "text", text: " to run it." },
    ]);
  });

  it("reduces a disallowed link to its plain text", () => {
    expect(parseReplyLinks("See [this](https://evil.example).")).toEqual([
      { kind: "text", text: "See " },
      { kind: "text", text: "this" },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves text without links untouched", () => {
    expect(parseReplyLinks("Hi! What can I help with?")).toEqual([{ kind: "text", text: "Hi! What can I help with?" }]);
  });
});

describe("parseReplyBlocks", () => {
  it("splits prose, a strategy draft and an action button", () => {
    const blocks = parseReplyBlocks(
      "Here's a draft:\n[[strategy]]\nName: EMA cross\nEntry: EMA(20) crosses above EMA(50)\n[[/strategy]]\nThen test it.\n[[go:/app/backtests|Review & run a backtest]]"
    );
    expect(blocks).toEqual([
      { kind: "text", text: "Here's a draft:" },
      {
        kind: "strategy",
        fields: [
          { label: "Name", value: "EMA cross" },
          { label: "Entry", value: "EMA(20) crosses above EMA(50)" },
        ],
      },
      { kind: "text", text: "Then test it." },
      { kind: "action", href: "/app/backtests", label: "Review & run a backtest" },
    ]);
  });

  it("drops action buttons that point anywhere but an allowed page", () => {
    expect(parseReplyBlocks("[[go:https://evil.example|Click me]]")).toEqual([]);
    expect(parseReplyBlocks("[[go:/app/admin|Admin]]")).toEqual([]);
  });
});
