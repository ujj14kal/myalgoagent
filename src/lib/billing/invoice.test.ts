import { describe, expect, it } from "vitest";
import { amountInWords, financialYear, gstSplit, invoiceHtml, invoiceNumber, invoiceText, methodLabel, rupees, type InvoiceModel } from "./invoice";

const model = (o: Partial<InvoiceModel> = {}): InvoiceModel => ({
  title: "TAX INVOICE",
  number: "MAA/2026-27/000001",
  date: new Date("2026-10-13T06:00:00Z"),
  paymentId: "pay_TestAbc123",
  method: "upi",
  status: "PAID",
  buyer: { name: "Asha <Rao>", email: "asha@example.com" },
  seller: { name: "Shagoon Softech Pvt. Ltd.", address: "Mumbai", gstin: "27ABCDE1234F1Z5", pan: "ABCDE1234F", email: "support@myalgoagent.com", website: "https://myalgoagent.com" },
  lines: [{ description: "Trade plan", detail: "13 Oct – 12 Nov 2026", qty: 1, totalPaise: 199_900, sac: "998439" }],
  ...o,
});

describe("GST split (prices include 18%)", () => {
  it("carves the tax out of the total and always adds back", () => {
    expect(gstSplit(199_900)).toEqual({ taxablePaise: 169_407, gstPaise: 30_493 });
    expect(gstSplit(349_900)).toEqual({ taxablePaise: 296_525, gstPaise: 53_375 });
    for (const t of [29_900, 79_900, 179_900, 399_900, 100]) {
      const s = gstSplit(t);
      expect(s.taxablePaise + s.gstPaise).toBe(t);
    }
  });
});

describe("amounts", () => {
  it("formats rupees the Indian way", () => {
    expect(rupees(199_900)).toBe("₹1,999.00");
    expect(rupees(1_234_567_89)).toBe("₹12,34,567.89");
  });
  it("writes amounts in words (thousand, lakh, crore)", () => {
    expect(amountInWords(199_900)).toBe("Rupees One Thousand Nine Hundred Ninety Nine Only");
    expect(amountInWords(349_900)).toBe("Rupees Three Thousand Four Hundred Ninety Nine Only");
    expect(amountInWords(12_50_000_00)).toBe("Rupees Twelve Lakh Fifty Thousand Only");
    expect(amountInWords(2_00_00_000_00)).toBe("Rupees Two Crore Only");
    expect(amountInWords(10_050)).toBe("Rupees One Hundred and Fifty Paise Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });
});

describe("numbering", () => {
  it("uses the April–March financial year in IST", () => {
    expect(financialYear(new Date("2026-10-13T06:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T20:00:00Z"))).toBe("2027-28"); // 1 April 01:30 IST
    expect(financialYear(new Date("2027-03-31T10:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
  });
  it("makes sortable numbers", () => expect(invoiceNumber("2026-27", 42)).toBe("MAA/2026-27/000042"));
  it("names the payment method", () => {
    expect(methodLabel("upi")).toBe("UPI");
    expect(methodLabel(null)).toBe("Online");
  });
});

describe("invoiceHtml", () => {
  it("shows the number, the buyer, the amounts and the words", () => {
    const h = invoiceHtml(model());
    expect(h).toContain("MAA/2026-27/000001");
    expect(h).toContain("TAX INVOICE");
    expect(h).toContain("₹1,999.00");
    expect(h).toContain("₹1,694.07");
    expect(h).toContain("₹304.93");
    expect(h).toContain("Rupees One Thousand Nine Hundred Ninety Nine Only");
    expect(h).toContain("27ABCDE1234F1Z5");
    expect(h).toContain("SAC");
    expect(h).toContain("PAID");
  });
  it("escapes everything a user can type", () => {
    const h = invoiceHtml(model());
    expect(h).toContain("Asha &lt;Rao&gt;");
    expect(h).not.toContain("<Rao>");
  });
  it("is an honest receipt (no SAC column, no GSTIN) when the company has none to print", () => {
    const h = invoiceHtml(model({ title: "PAYMENT RECEIPT", seller: { name: "Shagoon Softech Pvt. Ltd.", email: "support@myalgoagent.com", website: "https://myalgoagent.com" }, lines: [{ description: "Trade plan", qty: 1, totalPaise: 199_900 }] }));
    expect(h).toContain("PAYMENT RECEIPT");
    expect(h).not.toContain("GSTIN:");
    expect(h).not.toContain(">SAC<");
  });
  it("marks a refund clearly", () => expect(invoiceHtml(model({ status: "REFUNDED" }))).toContain("REFUNDED"));
  it("has a plain-text twin with the same total", () => {
    const t = invoiceText(model());
    expect(t).toContain("Total paid: ₹1,999.00");
    expect(t).toContain("MAA/2026-27/000001");
  });
});
