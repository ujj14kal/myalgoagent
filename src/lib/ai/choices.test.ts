import { describe, expect, it } from "vitest";
import { splitChoices } from "./choices";

describe("splitChoices", () => {
  it("pulls the “• …” answers out of the text", () => {
    const r = splitChoices("Accumulation is quiet buying.\n\n• Three higher lows with rising volume\n• A tight range for 8 candles\n\nWhich fits?");
    expect(r.choices).toEqual(["Three higher lows with rising volume", "A tight range for 8 candles"]);
    expect(r.body).toBe("Accumulation is quiet buying.\n\nWhich fits?");
  });
  it("drops chat-page links and bold marks from the answers", () => {
    const r = splitChoices("I prepared it. [[go:/app/workspaces|Review]]\n- **Bullish, in sequence** – one after another");
    expect(r.body).toBe("I prepared it.");
    expect(r.choices).toEqual(["Bullish, in sequence – one after another"]);
  });
  it("leaves plain text alone", () => {
    expect(splitChoices("Just a sentence.")).toEqual({ body: "Just a sentence.", choices: [] });
  });
});
