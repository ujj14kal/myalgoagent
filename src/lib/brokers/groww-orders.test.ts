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

import { beforeEach, vi } from "vitest";
import { placeGrowwOrder } from "./groww-orders";
import { brokerFetch } from "./egress";

// The test never reaches the network, whatever the environment (the build machine routes broker calls through the static-IP relay).
vi.mock("./egress", () => ({ brokerFetch: vi.fn() }));

describe("what Groww receives for every kind of order", () => {
  const sent: Record<string, unknown>[] = [];
  function stubGroww() {
    sent.length = 0;
    vi.mocked(brokerFetch).mockImplementation((async (_url: string, init: { body?: string }) => {
      sent.push(JSON.parse(init.body ?? "{}"));
      return { status: 200, text: async () => JSON.stringify({ status: "SUCCESS", payload: { groww_order_id: "GLT123", order_status: "NEW", remark: null } }) };
    }) as never);
  }
  beforeEach(() => {
    vi.mocked(brokerFetch).mockReset();
  });

  const types = ["MARKET", "LIMIT", "SL", "SL_M"] as const;
  const products = ["MIS", "CNC"] as const;
  const sides = ["BUY", "SELL"] as const;

  for (const orderType of types) {
    for (const product of products) {
      for (const side of sides) {
        it(`${side} ${orderType} ${product}`, async () => {
          stubGroww();
          const r = await placeGrowwOrder("tok", { tradingSymbol: "TARIL", exchange: "NSE", segment: "CASH", product, orderType, side, quantity: 3, price: 294.85, triggerPrice: 295.5, reference: "mwtestref0001" });
          expect(r.brokerOrderId).toBe("GLT123");
          const b = sent[0];
          expect(b).toMatchObject({ trading_symbol: "TARIL", quantity: 3, exchange: "NSE", segment: "CASH", product, order_type: orderType, transaction_type: side, validity: "DAY", order_reference_id: "mwtestref0001" });
          // A market order carries no price; a stop order carries a trigger.
          expect(b.price).toBe(orderType === "LIMIT" || orderType === "SL" ? 294.85 : 0);
          expect(b.trigger_price).toBe(orderType === "SL" || orderType === "SL_M" ? 295.5 : undefined);
        });
      }
    }
  }

  it("refuses a malformed reference before anything is sent", async () => {
    stubGroww();
    await expect(placeGrowwOrder("tok", { tradingSymbol: "TARIL", exchange: "NSE", segment: "CASH", product: "MIS", orderType: "MARKET", side: "BUY", quantity: 1, reference: "bad ref!" })).rejects.toThrow();
    expect(sent.length).toBe(0);
  });
});
