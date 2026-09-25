import { describe, expect, it } from "vitest";
import { toSpeech } from "./speech-text";

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
