// Sends one SAMPLE invoice (made-up payment) to an address you choose, so you can see how it looks in a real inbox.
//   AWS_PROFILE=myalgoagent npx tsx --conditions react-server scripts/send-sample-invoice.ts you@example.com
import { sendInvoiceEmail } from "../src/lib/email";
import { invoiceHtml, invoiceText, rupees, type InvoiceModel } from "../src/lib/billing/invoice";

const to = process.argv[2];
if (!to?.includes("@")) throw new Error("usage: send-sample-invoice.ts <email>");
const model: InvoiceModel = {
  title: "TAX INVOICE",
  number: "MAA/2026-27/SAMPLE",
  date: new Date(),
  paymentId: "pay_SAMPLE0000000",
  method: "upi",
  status: "PAID",
  buyer: { name: "Sample Customer", email: to },
  seller: { name: "Shagoon Softech Private Limited", address: "C/O Chenaram Jat Duduwala, Complex, G Block, Bhilwara - 311001, Rajasthan", gstin: "08ABUCS7513A1Z6", pan: "ABUCS7513A", email: "support@myalgoagent.com", website: "https://myalgoagent.com" },
  lines: [{ description: "MyAlgoAgent Trade plan", detail: "Monthly · sample, not a real payment", qty: 1, totalPaise: 235_882, sac: "998314" }],
};
void (async () => {
await sendInvoiceEmail(to, { number: model.number, totalLabel: rupees(235_882), invoiceHtml: invoiceHtml(model), text: invoiceText(model), viewUrl: "https://myalgoagent.com/app/account/usage", billingUrl: "https://myalgoagent.com/app/account/usage" });
console.log(`sample invoice sent to ${to}`);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
