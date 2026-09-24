import { describe, it, expect } from "vitest";
import { formatINR, formatSignedINR, formatPct, toneOf, formatPrice } from "@/lib/format";

describe("format", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(400000)).toBe("₹4,00,000");
    expect(formatPrice(2997.1)).toBe("2,997.10");
  });
  it("puts the minus sign before the ₹, with a real minus", () => {
    expect(formatINR(-1220.93, 2)).toBe("−₹1,220.93");
    expect(formatSignedINR(-1220.93, 2)).toBe("−₹1,220.93");
  });
  it("never shows zero as a gain", () => {
    expect(toneOf(0)).toBe("flat");
    expect(formatSignedINR(0)).toBe("₹0");
    expect(formatPct(0)).toBe("0.00%");
    expect(formatPct(0.001)).toBe("0.00%");
  });
  it("signs gains and losses", () => {
    expect(formatPct(24.4)).toBe("+24.40%");
    expect(formatPct(-0.73)).toBe("−0.73%");
    expect(formatSignedINR(1250)).toBe("+₹1,250");
  });
});
