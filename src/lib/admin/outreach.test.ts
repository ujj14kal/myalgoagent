import { describe, expect, it } from "vitest";
import { isOurAddress, parseRecipients, sendersFrom } from "./outreach";

describe("outreach rules", () => {
  it("accepts only our own domain as the sender, never noreply@", () => {
    expect(isOurAddress("support@myalgoagent.com")).toBe(true);
    expect(isOurAddress("Collab@MyAlgoAgent.com")).toBe(true);
    expect(isOurAddress("noreply@myalgoagent.com")).toBe(false);
    expect(isOurAddress("someone@gmail.com")).toBe(false);
    expect(isOurAddress("a@myalgoagent.com.evil.com")).toBe(false);
  });
  it("reads a recipient list and limits it", () => {
    expect(parseRecipients("a@x.com, B@y.com\n a@x.com")).toEqual({ ok: true, list: ["a@x.com", "b@y.com"] });
    expect(parseRecipients("").ok).toBe(false);
    expect(parseRecipients("nope").ok).toBe(false);
    expect(parseRecipients("a@x.com b@x.com c@x.com d@x.com e@x.com f@x.com").ok).toBe(false);
  });
  it("offers collaborations first, with its own name", () => {
    const list = sendersFrom(undefined);
    expect(list[0]).toEqual({ address: "collaborations@myalgoagent.com", name: "MyAlgoAgent Collaborations" });
    expect(list.map((s) => s.address)).toEqual(["collaborations@myalgoagent.com", "info@myalgoagent.com", "sales@myalgoagent.com", "support@myalgoagent.com"]);
  });
  it("adds extra senders from the setting, our domain only", () => {
    const list = sendersFrom("collab@myalgoagent.com|MyAlgoAgent Partnerships, bad@gmail.com|X");
    expect(list.some((s) => s.address === "collab@myalgoagent.com" && s.name === "MyAlgoAgent Partnerships")).toBe(true);
    expect(list.some((s) => s.address === "bad@gmail.com")).toBe(false);
  });
});
