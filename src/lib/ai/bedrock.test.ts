import { describe, expect, it } from "vitest";
import { toConverseMessages } from "./bedrock";

describe("toConverseMessages", () => {
  it("keeps a normal alternating conversation as-is", () => {
    const out = toConverseMessages([
      { role: "user", text: "hi" },
      { role: "assistant", text: "Hi! What can I help with?" },
      { role: "user", text: "what is RSI" },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("merges consecutive same-role turns (e.g. after a failed reply)", () => {
    const out = toConverseMessages([
      { role: "user", text: "first" },
      { role: "user", text: "second" },
    ]);
    expect(out).toEqual([{ role: "user", content: [{ text: "first\n\nsecond" }] }]);
  });

  it("drops leading assistant turns so the conversation starts with the user", () => {
    const out = toConverseMessages([
      { role: "assistant", text: "stale" },
      { role: "user", text: "hello" },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user"]);
  });

  it("does not mutate the input", () => {
    const turns = [
      { role: "user" as const, text: "a" },
      { role: "user" as const, text: "b" },
    ];
    toConverseMessages(turns);
    expect(turns[0].text).toBe("a");
  });
});
