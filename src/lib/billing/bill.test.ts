import { describe, expect, it } from "vitest";
import { billFor, itemKey, parseItem } from "./bill";

describe("checkout bill", () => {
  it("reads only things we sell", () => {
    expect(parseItem("plan:PRO")).toEqual({ kind: "plan", plan: "PRO" });
    expect(parseItem("plan:FREE")).toBeNull();
    expect(parseItem("topup:1200")).toEqual({ kind: "topup", credits: 1200 });
    expect(parseItem("topup:751")).toBeNull();
    expect(parseItem("hack")).toBeNull();
    expect(parseItem(undefined)).toBeNull();
    expect(itemKey({ kind: "topup", credits: 400 })).toBe("topup:400");
  });
  it("adds 18% GST on top of the price shown", () => {
    for (const k of ["plan:TRADE", "plan:PRO", "topup:400", "topup:1200", "topup:3000", "topup:8000"]) {
      const b = billFor(parseItem(k)!);
      expect(b.taxablePaise + b.gstPaise).toBe(b.totalPaise);
      expect(b.gstPaise).toBeGreaterThan(0);
    }
    const t = billFor({ kind: "plan", plan: "TRADE" });
    expect(t.taxablePaise).toBe(199_900); // ₹1,999 before GST
    expect(t.gstPaise).toBe(35_982);
    expect(t.totalPaise).toBe(235_882); // ₹2,358.82 paid
    const p = billFor({ kind: "plan", plan: "PRO" });
    expect([p.taxablePaise, p.gstPaise, p.totalPaise]).toEqual([349_900, 62_982, 412_882]);
    expect(billFor({ kind: "topup", credits: 400 }).totalPaise).toBe(35_282);
    expect(t.recurring).toBe(true);
    expect(billFor({ kind: "topup", credits: 400 }).recurring).toBe(false);
  });
});
