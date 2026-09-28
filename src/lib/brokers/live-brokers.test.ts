import { describe, expect, it } from "vitest";
import { LIVE_BROKERS, LIVE_NOT_YET, mapBrokerStatus, plainSymbol } from "./live-brokers";

describe("broker status words", () => {
  it("maps Kite-style words (Zerodha, Upstox, Angel One)", () => {
    expect(mapBrokerStatus("COMPLETE", 5, 5)).toBe("FILLED");
    expect(mapBrokerStatus("complete", 2, 5)).toBe("PARTIALLY_FILLED");
    expect(mapBrokerStatus("OPEN", 0, 5)).toBe("OPEN");
    expect(mapBrokerStatus("open pending", 0, 5)).toBe("OPEN");
    expect(mapBrokerStatus("put order req received", 0, 5)).toBe("OPEN");
    expect(mapBrokerStatus("TRIGGER PENDING", 0, 5)).toBe("TRIGGER_PENDING");
    expect(mapBrokerStatus("CANCELLED", 0, 5)).toBe("CANCELLED");
    expect(mapBrokerStatus("cancel pending", 0, 5)).toBe("OPEN");
    expect(mapBrokerStatus("REJECTED", 0, 5)).toBe("REJECTED");
  });
  it("maps Dhan, Fyers, 5paisa and Alice Blue words", () => {
    expect(mapBrokerStatus("TRADED", 5, 5)).toBe("FILLED");
    expect(mapBrokerStatus("PART_TRADED", 2, 5)).toBe("PARTIALLY_FILLED");
    expect(mapBrokerStatus("TRANSIT", 0, 5)).toBe("OPEN");
    expect(mapBrokerStatus("EXPIRED", 0, 5)).toBe("CANCELLED");
    expect(mapBrokerStatus("traded", 5, 5)).toBe("FILLED");
    expect(mapBrokerStatus("Fully Executed", 5, 5)).toBe("FILLED");
    expect(mapBrokerStatus("Pending", 0, 5)).toBe("OPEN");
    expect(mapBrokerStatus("Rejected By 5P", 0, 5)).toBe("REJECTED");
    expect(mapBrokerStatus("CANCEL REQUESTED", 0, 5)).toBe("OPEN");
  });
  it("keeps partial fills when an order is cancelled part-way", () => {
    expect(mapBrokerStatus("CANCELLED", 3, 5)).toBe("PARTIALLY_FILLED");
  });
});

describe("symbol read-back", () => {
  it("normalises every broker's symbol format to the plain NSE symbol", () => {
    expect(plainSymbol("RELIANCE-EQ")).toBe("RELIANCE");
    expect(plainSymbol("NSE:RELIANCE-EQ")).toBe("RELIANCE");
    expect(plainSymbol("RELIANCE_EQ")).toBe("RELIANCE");
    expect(plainSymbol("reliance")).toBe("RELIANCE");
    expect(plainSymbol("BAJAJ-AUTO-EQ")).toBe("BAJAJ-AUTO");
    expect(plainSymbol("M&M")).toBe("M&M");
    expect(plainSymbol(null)).toBeNull();
  });
});

describe("broker coverage", () => {
  it("has a live adapter for every connectable broker except the documented exceptions", () => {
    const connectable = ["dhan", "zerodha", "upstox", "fyers", "angelone", "groww", "icicidirect", "5paisa", "aliceblue"];
    for (const id of connectable) expect(!!LIVE_BROKERS[id as keyof typeof LIVE_BROKERS] || !!LIVE_NOT_YET[id as keyof typeof LIVE_NOT_YET]).toBe(true);
  });
  it("claims no broker is proven before a real test, and Angel One refuses market orders", () => {
    expect(Object.values(LIVE_BROKERS).filter((b) => b!.verified)).toEqual([]);
    expect(LIVE_BROKERS.angelone!.marketOrders).toBe(false);
  });
});
