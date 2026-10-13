import { GST_RATE, PLANS, TOPUP_PACKS, withGst } from "@/lib/credits/config";

// What a checkout shows before anyone pays: the item, what it gives, and the bill split into value and GST.
// Prices are shown before GST: the customer pays the price plus 18% GST, and the invoice shows the same split.

export type CheckoutItem = { kind: "plan"; plan: "TRADE" | "PRO" } | { kind: "topup"; credits: number };

export type Bill = {
  item: CheckoutItem;
  title: string;
  subtitle: string;
  /** What the customer gets. */
  perks: string[];
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
  gstRate: number;
  /** Plans renew every month until cancelled; top-ups are one-off. */
  recurring: boolean;
};

const fmt = (n: number) => n.toLocaleString("en-IN");

/** "plan:PRO" / "topup:1200" from the address, or null when it isn't something we sell. */
export function parseItem(raw: string | string[] | undefined): CheckoutItem | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const m = /^(plan|topup):([A-Za-z0-9]+)$/.exec(v ?? "");
  if (!m) return null;
  if (m[1] === "plan") return m[2] === "TRADE" || m[2] === "PRO" ? { kind: "plan", plan: m[2] } : null;
  const credits = Number(m[2]);
  return TOPUP_PACKS.some((p) => p.credits === credits) ? { kind: "topup", credits } : null;
}

export const itemKey = (i: CheckoutItem) => (i.kind === "plan" ? `plan:${i.plan}` : `topup:${i.credits}`);

export function billFor(item: CheckoutItem): Bill {
  if (item.kind === "plan") {
    const spec = PLANS[item.plan];
    const c = withGst(spec.price ?? 0);
    return {
      item,
      title: `${spec.label} plan`,
      subtitle: "Billed monthly · renews until you cancel",
      perks: [
        `${fmt(spec.monthlyCredits)} credits every month, ready now`,
        "AI assistant with voice, and intraday backtests",
        `Up to ${spec.slots.live} live strategies and ${spec.slots.forward} forward tests`,
        "Cancel any time: you keep the plan until the month you paid for ends",
      ],
      taxablePaise: c.basePaise,
      gstPaise: c.gstPaise,
      totalPaise: c.totalPaise,
      gstRate: GST_RATE,
      recurring: true,
    };
  }
  const pack = TOPUP_PACKS.find((p) => p.credits === item.credits)!;
  const c = withGst(pack.price);
  return {
    item,
    title: `${fmt(pack.credits)} credit top-up`,
    subtitle: "One-off payment",
    perks: [`${fmt(pack.credits)} credits added straight away`, "Kept for 12 months and used after your monthly credits", "Needs a Trade or Pro plan"],
    taxablePaise: c.basePaise,
    gstPaise: c.gstPaise,
    totalPaise: c.totalPaise,
    gstRate: GST_RATE,
    recurring: false,
  };
}
