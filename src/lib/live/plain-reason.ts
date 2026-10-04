// A broker's refusal, said so a person understands what happened and what to do.
// Falls back to the broker's own words — never invents a reason.

const inr = (n: string) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function plainReason(raw: string | null | undefined, broker = "your broker"): string {
  const r = (raw ?? "").trim();
  if (!r) return "no reason was given";
  const margin = /margin exceeds.*?required:\s*([\d.]+).*?available:\s*([\d.]+)/i.exec(r);
  if (margin) return `not enough margin — it needs ${inr(margin[1])} and ${inr(margin[2])} is available. Add funds, or lower the capital or quantity`;
  if (/margin|insufficient (funds|balance)/i.test(r)) return `not enough funds or margin (${r.slice(0, 120)})`;
  if (/please login|login again|session (expired|invalid)|invalid.*token|token.*(expired|invalid)|unauthori[sz]ed/i.test(r)) return `${broker} says today's login has expired — log in to ${broker} again`;
  if (/static ip|ip (address )?(is )?not (allowed|whitelisted|registered)|ip.*mismatch|whitelist/i.test(r)) return `${broker} doesn't recognise the IP the order came from — check the static IP registered on your ${broker} account`;
  if (/market.*(closed|not open)|outside.*(market|trading)/i.test(r)) return "the market is closed";
  if (/circuit|price band|freeze/i.test(r)) return `the stock is outside its allowed price range or frozen (${r.slice(0, 100)})`;
  if (/quantity/i.test(r)) return `the quantity wasn't accepted (${r.slice(0, 120)})`;
  if (/rate[ _]?limit|too many requests|429/i.test(r)) return `${broker} is limiting how fast we can send requests — we tried again a few times and it still wasn't accepted`;
  return r.length > 200 ? `${r.slice(0, 197)}…` : r;
}
