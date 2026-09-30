import { describe, expect, it } from "vitest";
import { speechChunks, toSpeech } from "./speech-text";

describe("toSpeech", () => {
  it("strips markdown and turns list items into sentences", () => {
    expect(toSpeech("**RSI** measures momentum:\n- above 70 is overbought\n- below 30 is oversold")).toBe(
      "RSI measures momentum: above 70 is overbought. below 30 is oversold."
    );
  });

  it("drops action buttons and keeps link labels", () => {
    expect(toSpeech("See [Risk Controls](/app/risk-controls).\n[[go:/app/backtests|Run a backtest]]")).toBe("See Risk Controls.");
  });

  it("summarises tables and strategy cards instead of reading them", () => {
    const reply = "Here are your results:\n| Metric | Value |\n|---|---|\n| Return | 12% |\nNice.\n[[strategy]]\nName: X\n[[/strategy]]";
    expect(toSpeech(reply)).toBe("Here are your results: I've put the details in a table in the chat. Nice. I've drafted the strategy in the chat for you.");
  });

  it("cuts long replies at a sentence and says the rest is in the chat", () => {
    const long = "This is one sentence. ".repeat(200);
    const spoken = toSpeech(long, 100);
    expect(spoken.length).toBeLessThan(140);
    expect(spoken.endsWith("The rest is in the chat.")).toBe(true);
  });
});

describe("speechChunks", () => {
  it("returns one piece for a short reply", () => {
    expect(speechChunks("Sure, I can do that.")).toEqual(["Sure, I can do that."]);
    expect(speechChunks("")).toEqual([]);
  });

  it("makes the first piece short so speech can start quickly", () => {
    const text = "Your RSI strategy made twelve percent. It had a win rate of sixty percent across forty trades, with a maximum drawdown of six percent. Want me to run it forward?";
    const chunks = speechChunks(text);
    expect(chunks[0]).toBe("Your RSI strategy made twelve percent.");
    expect(chunks.join(" ")).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("does not split inside numbers or indicator settings", () => {
    const text = "It gained 1.5 percent on RSI(14). Then it fell.";
    expect(speechChunks(text, 10, 10).join(" ")).toBe(text);
    expect(speechChunks("Price is 1.5 lakh. RSI(14) is high.", 10, 10)).toEqual(["Price is 1.5 lakh.", "RSI(14) is high."]);
  });

  it("keeps every word, in order, whatever the limits", () => {
    const text = "One thing. Another thing, longer than the first. A third? Yes! And a fourth one here.";
    for (const [a, b] of [[5, 5], [30, 60], [200, 400]]) expect(speechChunks(text, a, b).join(" ")).toBe(text);
  });
});
