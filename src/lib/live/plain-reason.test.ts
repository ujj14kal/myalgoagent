import { describe, expect, it } from "vitest";
import { plainReason } from "./plain-reason";

describe("plainReason", () => {
  it("explains a margin refusal with the amounts", () => {
    const m = plainReason("RMS:Margin Exceeds,Required:275.05, Available:200.00 for entity account-6245238129 across exchange across segment across product ", "Groww");
    expect(m).toContain("not enough margin");
    expect(m).toContain("₹275.05");
    expect(m).toContain("₹200");
  });
  it("tells the user to log in again when the session has expired", () => {
    expect(plainReason("Please Login and Try Again", "Groww")).toBe("Groww says today's login has expired — log in to Groww again");
  });
  it("points at the static IP when the broker doesn't recognise it", () => {
    expect(plainReason("IP not whitelisted for this API key", "Dhan")).toContain("static IP");
  });
  it("handles a closed market, price band and rate limits", () => {
    expect(plainReason("Market is closed")).toBe("the market is closed");
    expect(plainReason("Order outside price band")).toContain("allowed price range");
    expect(plainReason("Too many requests", "Groww")).toContain("limiting");
  });
  it("never invents a reason: unknown text passes through, empty says none was given", () => {
    expect(plainReason("Some new broker message")).toBe("Some new broker message");
    expect(plainReason(null)).toBe("no reason was given");
    expect(plainReason("x".repeat(300)).length).toBe(198);
  });
});
