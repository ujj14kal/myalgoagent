// Profit and loss of a live strategy from its own filled orders, first-in-first-out: each sell closes the
// oldest buys (and a short sale is closed by a later buy). Realised comes from what was closed; unrealised
// from what is still open, valued at the latest price. Before brokerage, taxes and charges — the broker's own
// statement is the record of those.

export type Fill = { side: "BUY" | "SELL"; quantity: number; price: number; at: number };

export type PnlResult = {
  /** Booked profit/loss from positions closed since `since` (epoch ms). */
  realisedSince: number;
  /** Booked profit/loss on everything ever closed. */
  realisedTotal: number;
  /** Open quantity: positive long, negative short. */
  openQty: number;
  /** Average price of the open quantity. */
  openAvg: number | null;
  /** Profit/loss on the open quantity at `last`; null when there's no price or no position. */
  unrealised: number | null;
};

export function fifoPnl(fills: Fill[], last: number | null, since: number): PnlResult {
  const lots: { qty: number; price: number }[] = []; // qty signed: + long, − short
  let realisedSince = 0;
  let realisedTotal = 0;
  for (const f of [...fills].sort((a, b) => a.at - b.at)) {
    let left = f.side === "BUY" ? f.quantity : -f.quantity;
    while (left !== 0 && lots.length && Math.sign(lots[0].qty) !== Math.sign(left)) {
      const lot = lots[0];
      const closed = Math.min(Math.abs(lot.qty), Math.abs(left));
      const pnl = (f.price - lot.price) * closed * Math.sign(lot.qty);
      realisedTotal += pnl;
      if (f.at >= since) realisedSince += pnl;
      lot.qty -= Math.sign(lot.qty) * closed;
      left -= Math.sign(left) * closed;
      if (lot.qty === 0) lots.shift();
    }
    if (left !== 0) lots.push({ qty: left, price: f.price });
  }
  const openQty = lots.reduce((s, l) => s + l.qty, 0);
  const cost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  return {
    realisedSince: round(realisedSince),
    realisedTotal: round(realisedTotal),
    openQty,
    openAvg: openQty !== 0 ? round(cost / openQty) : null,
    unrealised: last != null && openQty !== 0 ? round(lots.reduce((s, l) => s + (last - l.price) * l.qty, 0)) : null,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
