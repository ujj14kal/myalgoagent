// The invoice: one design, used for the email and for the printable page in the app. Pure functions (no database, no
// network), so the money maths and the wording are tested. A payment is the price plus 18% GST, so the total splits back into the value and the tax exactly.

export type InvoiceModel = {
  /** "TAX INVOICE" only when the company has a GSTIN to print; otherwise an honest "PAYMENT RECEIPT". */
  title: "TAX INVOICE" | "PAYMENT RECEIPT" | "CREDIT NOTE";
  number: string;
  date: Date;
  paymentId: string;
  method: string | null;
  status: "PAID" | "REFUNDED";
  buyer: { name: string; email: string; gstin?: string | null; address?: string | null };
  seller: { name: string; address?: string | null; gstin?: string | null; pan?: string | null; email: string; website: string };
  /** Set on a credit note: the invoice it is issued against. */
  creditNote?: { against: string; againstDate: Date };
  lines: { description: string; detail?: string | null; qty: number; totalPaise: number; sac?: string | null }[];
};

import { GST_RATE } from "@/lib/credits/config";
export { GST_RATE };

/** A total (price + GST) split back into the value before tax and the tax itself (they always add back to the total). */
export function gstSplit(totalPaise: number, rate = GST_RATE): { taxablePaise: number; gstPaise: number } {
  const taxablePaise = Math.round((totalPaise * 100) / (100 + rate));
  return { taxablePaise, gstPaise: totalPaise - taxablePaise };
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const below1000 = (n: number) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " : ""}` : ""}${n % 100 ? below100(n % 100) : ""}`;

/** "Rupees One Thousand Nine Hundred Ninety Nine Only" — the Indian system (thousand, lakh, crore). */
export function amountInWords(paise: number): string {
  const rupeesPart = Math.floor(paise / 100);
  const p = paise % 100;
  const parts: string[] = [];
  let n = rupeesPart;
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  const r = parts.join(" ") || "Zero";
  return `Rupees ${r}${p ? ` and ${below100(p)} Paise` : ""} Only`;
}

/** The Indian financial year (April–March) a date falls in, in IST: "2026-27". */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export const invoiceNumber = (fy: string, seq: number) => `MAA/${fy}/${String(seq).padStart(6, "0")}`;
export const creditNoteNumber = (fy: string, seq: number) => `MAA/CN/${fy}/${String(seq).padStart(6, "0")}`;

const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const NAVY = "#0e1b2d";
const PURPLE = "#471898";
const MUTED = "#6b7788";
const LINE = "#e6eaf0";
const SITE = "https://myalgoagent.com";

export const methodLabel = (m: string | null) => ({ upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emandate: "eMandate" } as Record<string, string>)[m ?? ""] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : "Online");

/**
 * The invoice as email-safe HTML (tables and inline styles, so Gmail, Outlook and phones all draw it the same way). The same
 * markup is shown in the app, where it is printed or saved as PDF.
 */
export function invoiceHtml(m: InvoiceModel): string {
  const total = m.lines.reduce((s, l) => s + l.totalPaise, 0);
  const { taxablePaise, gstPaise } = gstSplit(total);
  const showSac = m.lines.some((l) => l.sac);
  const paid = m.status === "PAID";
  const badge = `<span style="display:inline-block;border:2px solid ${paid ? "#0b7a3b" : "#9b1111"};color:${paid ? "#0b7a3b" : "#9b1111"};border-radius:8px;padding:3px 12px;font-size:13px;font-weight:800;letter-spacing:2px;transform:rotate(-3deg)">${paid ? "PAID" : "REFUNDED"}</span>`;
  const cell = (s: string, right = false, extra = "") => `<td style="padding:14px 10px;border-bottom:1px solid ${LINE};font-size:13px;vertical-align:top;${right ? "text-align:right;white-space:nowrap;" : ""}${extra}">${s}</td>`;
  const head = (s: string, right = false) => `<th style="padding:10px;background:#f6f3fc;color:${PURPLE};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:${right ? "right" : "left"};border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">${s}</th>`;
  const rows = m.lines
    .map((l) => {
      const s = gstSplit(l.totalPaise);
      return `<tr>${cell(`<strong style="font-size:14px;color:${NAVY}">${e(l.description)}</strong>${l.detail ? `<br><span style="color:${MUTED};font-size:12px">${e(l.detail)}</span>` : ""}`)}${showSac ? cell(e(l.sac ?? "")) : ""}${cell(String(l.qty), true)}${cell(rupees(s.taxablePaise), true)}${cell(rupees(s.gstPaise), true)}${cell(`<strong>${rupees(l.totalPaise)}</strong>`, true)}</tr>`;
    })
    .join("");
  const seller = m.seller;
  const meta = (k: string, v: string) => `<tr><td style="padding:3px 0;color:${MUTED};font-size:12px;white-space:nowrap;padding-right:14px">${k}</td><td style="padding:3px 0;font-size:13px;font-weight:600;color:${NAVY};text-align:right">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY};background:#ffffff">
<tr><td style="background:#ffffff;padding:22px 28px;border:1px solid ${LINE};border-bottom:0;border-radius:14px 14px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${SITE}/brand/myalgoagent-logo-wide.png" width="190" alt="MyAlgoAgent" style="display:block;border:0;width:190px;height:auto"></td>
<td style="text-align:right;vertical-align:middle"><span style="color:${PURPLE};font-size:11px;font-weight:700;letter-spacing:2px">${e(m.title)}</span><br><span style="color:${NAVY};font-size:15px;font-weight:700;font-family:Menlo,Consolas,monospace">${e(m.number)}</span></td>
</tr></table></td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,${PURPLE},#bda360);font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 28px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:top;width:52%">
<p style="margin:0 0 6px;color:${MUTED};font-size:11px;font-weight:700;letter-spacing:1.5px">BILLED TO</p>
<p style="margin:0;font-size:15px;font-weight:700">${e(m.buyer.name || m.buyer.email)}</p>
<p style="margin:2px 0 0;color:${MUTED};font-size:13px">${e(m.buyer.email)}</p>
${m.buyer.address ? `<p style="margin:2px 0 0;color:${MUTED};font-size:13px">${e(m.buyer.address)}</p>` : ""}
${m.buyer.gstin ? `<p style="margin:2px 0 0;font-size:12px;color:${MUTED}">GSTIN: <strong style="color:${NAVY}">${e(m.buyer.gstin)}</strong></p>` : ""}
</td>
<td style="vertical-align:top"><table role="presentation" align="right" cellpadding="0" cellspacing="0">
${meta(m.creditNote ? "Credit note date" : "Invoice date", e(day(m.date)))}${m.creditNote ? meta("Against invoice", `<span style="font-family:Menlo,Consolas,monospace;font-size:12px">${e(m.creditNote.against)}</span>`) + meta("Invoice dated", e(day(m.creditNote.againstDate))) : ""}${meta("Payment ID", `<span style="font-family:Menlo,Consolas,monospace;font-size:12px">${e(m.paymentId)}</span>`)}${meta("Paid by", e(methodLabel(m.method)))}${meta("Currency", "INR (₹)")}
</table></td></tr></table></td></tr>
<tr><td style="padding:14px 28px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;border-collapse:separate;overflow:hidden">
<tr>${head("Description")}${showSac ? head("SAC") : ""}${head("Qty", true)}${head("Value", true)}${head(`GST ${GST_RATE}%`, true)}${head("Amount", true)}</tr>
${rows}
</table></td></tr>
<tr><td style="padding:10px 28px 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:46%;padding-right:16px">${badge}<p style="margin:14px 0 0;color:${MUTED};font-size:12px;line-height:1.5">${paid ? "Paid in full. Thank you for choosing MyAlgoAgent." : m.creditNote ? "This credit note records the refund of the payment above. The amount returns to the original payment method; your bank may take a few days to show it." : "This payment has been refunded."}</p></td>
<td style="vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:5px 0;color:${MUTED};font-size:13px">Value before GST</td><td style="padding:5px 0;text-align:right;font-size:13px">${rupees(taxablePaise)}</td></tr>
<tr><td style="padding:5px 0;color:${MUTED};font-size:13px">GST @ ${GST_RATE}%</td><td style="padding:5px 0;text-align:right;font-size:13px">${rupees(gstPaise)}</td></tr>
<tr><td colspan="2" style="padding:6px 0 0"><div style="border-top:2px solid ${NAVY}"></div></td></tr>
<tr><td style="padding:8px 0 0;font-size:15px;font-weight:700">Total ${paid ? "paid" : "refunded"}</td><td style="padding:8px 0 0;text-align:right;font-size:22px;font-weight:800;color:${PURPLE}">${rupees(total)}</td></tr>
</table></td></tr></table></td></tr>
<tr><td style="padding:6px 28px 0"><p style="margin:0;padding:10px 14px;background:#f6f3fc;border-radius:10px;color:${NAVY};font-size:12px"><span style="color:${MUTED}">Amount in words:</span> <strong>${e(amountInWords(total))}</strong></p></td></tr>
<tr><td style="padding:22px 28px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE}"><tr>
<td style="padding-top:14px;vertical-align:top;font-size:12px;line-height:1.6;color:${MUTED}">
<img src="${SITE}/brand/shagoon-softech-logo-wide.png" width="170" alt="Shagoon Softech" style="display:block;border:0;width:170px;height:auto;margin:0 0 10px">
<strong style="color:${NAVY}">${e(seller.name)}</strong><br>
${seller.address ? `${e(seller.address)}<br>` : ""}${seller.gstin ? `GSTIN: ${e(seller.gstin)}` : ""}${seller.gstin && seller.pan ? " · " : ""}${seller.pan ? `PAN: ${e(seller.pan)}` : ""}${seller.gstin || seller.pan ? "<br>" : ""}
<a href="mailto:${e(seller.email)}" style="color:${PURPLE};text-decoration:none">${e(seller.email)}</a> · <a href="${e(seller.website)}" style="color:${PURPLE};text-decoration:none">${e(seller.website.replace(/^https?:\/\//, ""))}</a>
</td></tr></table>
<p style="margin:12px 0 0;font-size:11px;line-height:1.6;color:${MUTED}">GST is charged at ${GST_RATE}% on the value. This is a computer-generated ${m.title === "TAX INVOICE" ? "invoice" : m.title === "CREDIT NOTE" ? "credit note" : "receipt"} and needs no signature. MyAlgoAgent is software for building and testing your own strategies; it gives no investment advice, and trading involves risk of loss.</p>
</td></tr></table>`;
}

/** The plain-text twin of the invoice, for mail apps that don't show HTML. */
export function invoiceText(m: InvoiceModel): string {
  const total = m.lines.reduce((s, l) => s + l.totalPaise, 0);
  const { taxablePaise, gstPaise } = gstSplit(total);
  return [
    `${m.title} ${m.number}${m.creditNote ? ` (against invoice ${m.creditNote.against})` : ""}`,
    `Date: ${day(m.date)}   Payment ID: ${m.paymentId}   Paid by: ${methodLabel(m.method)}`,
    `Billed to: ${m.buyer.name || m.buyer.email} <${m.buyer.email}>${m.buyer.gstin ? `  GSTIN ${m.buyer.gstin}` : ""}`,
    "",
    ...m.lines.map((l) => `${l.description}${l.detail ? ` (${l.detail})` : ""}  x${l.qty}  ${rupees(l.totalPaise)}`),
    "",
    `Value before GST: ${rupees(taxablePaise)}`,
    `GST @ ${GST_RATE}%: ${rupees(gstPaise)}`,
    `Total ${m.status === "PAID" ? "paid" : "refunded"}: ${rupees(total)}`,
    amountInWords(total),
    "",
    `${m.seller.name}${m.seller.gstin ? ` · GSTIN ${m.seller.gstin}` : ""}${m.seller.pan ? ` · PAN ${m.seller.pan}` : ""} · ${m.seller.email}`,
    "GST is charged at 18% on the value. Computer-generated; no signature needed.",
  ].join("\n");
}
