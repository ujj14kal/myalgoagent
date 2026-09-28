import { describe, expect, it } from "vitest";
import { growwSymbolOf, isValidReference, mapGrowwStatus } from "./groww-orders";

describe("Groww order status mapping", () => {
  it("treats working states as open", () => {
    for (const s of ["NEW", "ACKED", "APPROVED", "OPEN", "CANCELLATION_REQUESTED", "MODIFICATION_REQUESTED"]) expect(mapGrowwStatus(s, 0, 10)).toBe("OPEN");
  });
  it("knows filled, partial, cancelled, rejected, failed and trigger-pending", () => {
    expect(mapGrowwStatus("EXECUTED", 10, 10)).toBe("FILLED");
    expect(mapGrowwStatus("COMPLETED", 10, 10)).toBe("FILLED");
    expect(mapGrowwStatus("DELIVERY_AWAITED", 10, 10)).toBe("FILLED");
    expect(mapGrowwStatus("EXECUTED", 4, 10)).toBe("PARTIALLY_FILLED");
    expect(mapGrowwStatus("OPEN", 4, 10)).toBe("PARTIALLY_FILLED");
    expect(mapGrowwStatus("CANCELLED", 0, 10)).toBe("CANCELLED");
    expect(mapGrowwStatus("CANCELLED", 3, 10)).toBe("PARTIALLY_FILLED");
    expect(mapGrowwStatus("REJECTED", 0, 10)).toBe("REJECTED");
    expect(mapGrowwStatus("FAILED", 0, 10)).toBe("FAILED");
    expect(mapGrowwStatus("TRIGGER_PENDING", 0, 10)).toBe("TRIGGER_PENDING");
  });
});

describe("order references", () => {
  it("accepts Groww's format: 8–20 characters, letters/digits, at most two hyphens", () => {
    expect(isValidReference("MAA-ab12cd34")).toBe(true);
    expect(isValidReference("MAAab12cd34ef56gh78")).toBe(true);
    expect(isValidReference("short")).toBe(false);
    expect(isValidReference("MAA-a-b-c1234")).toBe(false);
    expect(isValidReference("MAA_ab12cd34")).toBe(false);
    expect(isValidReference("MAA-ab12cd34ef56gh78xyz")).toBe(false);
  });
});

describe("instrument symbols", () => {
  it("maps our NSE/BSE symbols to Groww trading symbols", () => {
    expect(growwSymbolOf("RELIANCE.NS")).toEqual({ tradingSymbol: "RELIANCE", exchange: "NSE" });
    expect(growwSymbolOf("M&M.NS")).toEqual({ tradingSymbol: "M&M", exchange: "NSE" });
    expect(growwSymbolOf("BAJAJ-AUTO.NS")).toEqual({ tradingSymbol: "BAJAJ-AUTO", exchange: "NSE" });
    expect(growwSymbolOf("500325.BO")).toEqual({ tradingSymbol: "500325", exchange: "BSE" });
  });
  it("refuses indices and anything else", () => {
    expect(growwSymbolOf("^NSEI")).toBeNull();
    expect(growwSymbolOf("AAPL")).toBeNull();
  });
});
