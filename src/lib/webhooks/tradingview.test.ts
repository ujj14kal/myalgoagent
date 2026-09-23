import { describe, it, expect } from "vitest";
import { parseTradingViewPayload } from "@/lib/webhooks/tradingview";

describe("parseTradingViewPayload — well-formed input", () => {
  it("parses plain-text BUY and SELL", () => {
    expect(parseTradingViewPayload("BUY")).toEqual({ action: "BUY" });
    expect(parseTradingViewPayload("go short now")).toEqual({ action: "SELL" });
  });

  it("parses JSON using any of the accepted field names", () => {
    expect(parseTradingViewPayload('{"action":"buy"}')).toEqual({ action: "BUY" });
    expect(parseTradingViewPayload('{"side":"SELL"}')).toEqual({ action: "SELL" });
    expect(parseTradingViewPayload('{"signal":"long"}')).toEqual({ action: "BUY" });
    expect(parseTradingViewPayload('{"order":"exit"}')).toEqual({ action: "SELL" });
  });
});

describe("parseTradingViewPayload — plain text that merely contains braces later is still plain text", () => {
  it("does not treat text that doesn't START with a JSON bracket as broken JSON", () => {
    expect(parseTradingViewPayload("BUY {ticker}")).toEqual({ action: "BUY" });
  });
});

describe("parseTradingViewPayload — malformed / hostile input never throws and never guesses", () => {
  const rejected: Array<[string, string]> = [
    ["empty string", ""],
    ["whitespace only", "   \n\t  "],
    ["ambiguous text (both buy and sell words)", "buy and sell"],
    ["unrelated text", "hello world"],
    ["broken/truncated JSON (must NOT be word-matched into a trade)", '{"action": "buy"'],
    ["broken JSON array", '["buy"'],
    ["JSON null", "null"],
    ["JSON number", "42"],
    ["JSON array", '["buy"]'],
    ["JSON with non-string action", '{"action": 1}'],
    ["JSON with nested object action", '{"action": {"x": "buy"}}'],
    ["JSON with unrecognized action word", '{"action": "hold"}'],
    ["JSON object without any known field", '{"foo": "buy"}'],
  ];

  for (const [name, input] of rejected) {
    it(`rejects: ${name}`, () => {
      const result = parseTradingViewPayload(input);
      expect(result.action).toBeUndefined();
      expect(typeof result.error).toBe("string");
    });
  }

  it("survives a NUL byte inside otherwise valid text", () => {
    expect(() => parseTradingViewPayload("BU\0Y")).not.toThrow();
  });

  it("handles a very large garbage payload quickly and without throwing", () => {
    const big = "x".repeat(500_000);
    const start = Date.now();
    const result = parseTradingViewPayload(big);
    expect(result.action).toBeUndefined();
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("handles deeply nested JSON without throwing", () => {
    const nested = "[".repeat(5000) + "]".repeat(5000);
    expect(() => parseTradingViewPayload(nested)).not.toThrow();
  });

  it("clips an attacker-supplied action value in the error message", () => {
    const result = parseTradingViewPayload(JSON.stringify({ action: "z".repeat(10_000) }));
    expect(result.error!.length).toBeLessThan(200);
  });
});
