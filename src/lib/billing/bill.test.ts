import { describe, expect, it } from "vitest";
import { billFor, itemKey, parseItem } from "./bill";

describe("checkout bill", () => {
  it("reads only things we sell", () => {
    expect(parseItem("plan:PRO")).toEqual({ kind: "plan", plan: "PRO" });
    expect(parseItem("plan:FREE")).toBeNull();
    expect(parseItem("topup:750")).toEqual({ kind: "topup", credits: 750 });
    expect(parseItem("topup:751")).toBeNull();
    expect(parseItem("hack")).toBeNull();
    expect(parseItem(undefined)).toBeNull();
    expect(itemKey({ kind: "topup", credits: 250 })).toBe("topup:250");
  });
  it("splits the GST-inclusive price into value and tax that add back to the total", () => {
    for (const k of ["plan:TRADE", "plan:PRO", "topup:250", "topup:750", "topup:2000", "topup:5000"]) {
      const b = billFor(parseItem(k)!);
      expect(b.taxablePaise + b.gstPaise).toBe(b.totalPaise);
      expect(b.gstPaise).toBeGreaterThan(0);
    }
    const t = billFor({ kind: "plan", plan: "TRADE" });
    expect(t.totalPaise).toBe(199_900);
    expect(t.taxablePaise).toBe(169_407);
    expect(t.recurring).toBe(true);
    expect(billFor({ kind: "topup", credits: 250 }).recurring).toBe(false);
  });
});
