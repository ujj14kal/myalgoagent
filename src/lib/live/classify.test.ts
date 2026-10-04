import { describe, expect, it } from "vitest";
import { classifyOrder, classifyPosition, type OurOrder } from "./classify";

const NOW = new Date("2026-10-05T11:00:00+05:30");
const ours = (o: Partial<OurOrder>): OurOrder => ({ brokerOrderId: "GLT1", tradingSymbol: "TARIL", side: "SELL", quantity: 1, filledQuantity: 1, status: "FILLED", createdAt: NOW, strategyName: "NEW 1", ...o });

describe("classifyOrder", () => {
  it("is MAA when the broker id is one we sent", () => {
    expect(classifyOrder({ id: "GLT1", symbol: "TARIL", side: "SELL", quantity: 1 }, [ours({})])).toEqual({ source: "MAA", strategyName: "NEW 1" });
  });
  it("is MANUAL when it is not in our complete record", () => {
    expect(classifyOrder({ id: "GLT9", symbol: "ITC", side: "BUY", quantity: 5 }, [ours({})]).source).toBe("MANUAL");
    expect(classifyOrder({ id: "GLT9", symbol: "ITC", side: "BUY", quantity: 5 }, []).source).toBe("MANUAL");
  });
  it("is UNKNOWN when an order of ours that never got a broker id could be it", () => {
    const lost = ours({ brokerOrderId: null, status: "OPEN", tradingSymbol: "ITC", side: "BUY", quantity: 5, filledQuantity: 0 });
    expect(classifyOrder({ id: "GLT9", symbol: "ITC-EQ", side: "BUY", quantity: 5 }, [lost]).source).toBe("UNKNOWN");
    expect(classifyOrder({ id: "GLT9", symbol: "ITC", side: "BUY", quantity: 6 }, [lost]).source).toBe("MANUAL"); // different quantity: not it
  });
});

describe("classifyPosition", () => {
  it("is MAA when our fills explain all of it (long or short)", () => {
    expect(classifyPosition({ symbol: "TARIL", product: "MIS", quantity: -1 }, [ours({})], NOW)).toBe("MAA");
    expect(classifyPosition({ symbol: "TARIL", product: "MIS", quantity: 1 }, [ours({ side: "BUY" })], NOW)).toBe("MAA");
  });
  it("is MANUAL when none of our orders touch it", () => {
    expect(classifyPosition({ symbol: "ITC", product: "MIS", quantity: 10 }, [ours({})], NOW)).toBe("MANUAL");
  });
  it("is MIXED when ours explain only part of it", () => {
    expect(classifyPosition({ symbol: "TARIL", product: "MIS", quantity: -3 }, [ours({})], NOW)).toBe("MIXED");
  });
  it("does not count a closed-out strategy trade: buy then sell back nets to zero", () => {
    const round = [ours({ side: "SELL", brokerOrderId: "A" }), ours({ side: "BUY", brokerOrderId: "B" })];
    expect(classifyPosition({ symbol: "TARIL", product: "MIS", quantity: -2 }, round, NOW)).toBe("MANUAL");
  });
  it("is UNKNOWN while an order of ours on that stock is still unconfirmed", () => {
    expect(classifyPosition({ symbol: "TARIL", product: "MIS", quantity: -1 }, [ours({ brokerOrderId: null, status: "OPEN", filledQuantity: 0 })], NOW)).toBe("UNKNOWN");
  });
  it("for an intraday position, ignores our orders from earlier days", () => {
    const old = ours({ createdAt: new Date("2026-10-01T11:00:00+05:30") });
    expect(classifyPosition({ symbol: "TARIL", product: "MIS", quantity: -1 }, [old], NOW)).toBe("MANUAL");
    expect(classifyPosition({ symbol: "TARIL", product: "CNC", quantity: -1 }, [old], NOW)).toBe("MAA");
  });
});
