import { describe, expect, it } from "vitest";
import { describeLegs, parseTradeLegs } from "./legs";

const date = (sec: number) => `d${sec}`;

describe("trade legs", () => {
  const legs = {
    entries: [{ level: 2, time: 20, price: 97, quantity: 25 }],
    exits: [
      { time: 30, price: 105, quantity: 25, netPnl: 200, reason: "target" as const, targetLevel: 1 },
      { time: 40, price: 105, quantity: 25, netPnl: 150, reason: "locked_profit" as const },
    ],
  };
  it("reads them back from saved JSON, and ignores anything else", () => {
    expect(parseTradeLegs(JSON.parse(JSON.stringify(legs)))).toEqual(legs);
    expect(parseTradeLegs(null)).toBeNull();
    expect(parseTradeLegs({ exits: 1 })).toBeNull();
  });
  it("describes the parts in time order", () => {
    expect(describeLegs(legs, date)).toBe("d20: Bought 25 at ₹97 (entry 2) · d30: Sold 25 at ₹105 (Target 1) · d40: Sold 25 at ₹105 (locked profit)");
  });
});
