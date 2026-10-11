import { describe, expect, it } from "vitest";
import { fifoPnl } from "./pnl";

const f = (side: "BUY" | "SELL", quantity: number, price: number, at: number) => ({ side, quantity, price, at });

describe("fifoPnl", () => {
  it("values an open long at the latest price", () => {
    const r = fifoPnl([f("BUY", 10, 100, 1)], 105, 0);
    expect(r).toMatchObject({ openQty: 10, openAvg: 100, unrealised: 50, realisedSince: 0 });
  });
  it("books a round trip", () => {
    const r = fifoPnl([f("BUY", 10, 100, 1), f("SELL", 10, 103, 2)], 200, 0);
    expect(r).toMatchObject({ realisedTotal: 30, realisedSince: 30, openQty: 0, unrealised: null });
  });
  it("closes the oldest buys first", () => {
    const r = fifoPnl([f("BUY", 5, 100, 1), f("BUY", 5, 110, 2), f("SELL", 5, 120, 3)], 120, 0);
    expect(r.realisedTotal).toBe(100); // against the 100s
    expect(r).toMatchObject({ openQty: 5, openAvg: 110, unrealised: 50 });
  });
  it("handles a short sale and its cover", () => {
    const r = fifoPnl([f("SELL", 10, 100, 1), f("BUY", 10, 96, 2)], null, 0);
    expect(r.realisedTotal).toBe(40);
    const open = fifoPnl([f("SELL", 10, 100, 1)], 98, 0);
    expect(open).toMatchObject({ openQty: -10, unrealised: 20 });
  });
  it("counts only what was closed since the cut-off as today's", () => {
    const r = fifoPnl([f("BUY", 10, 100, 1), f("SELL", 4, 110, 5), f("SELL", 6, 90, 20)], null, 10);
    expect(r.realisedTotal).toBe(40 - 60);
    expect(r.realisedSince).toBe(-60);
  });
  it("splits a fill that flips the position", () => {
    const r = fifoPnl([f("BUY", 5, 100, 1), f("SELL", 8, 110, 2)], 108, 0);
    expect(r.realisedTotal).toBe(50);
    expect(r).toMatchObject({ openQty: -3, openAvg: 110, unrealised: 6 });
  });
});
