// How an order reads in the Orders ledger: what it was for (entry, exit, manual…), which strategy sent it
// and, for an exit, why it was sent. The reason is stored as `Strategy “name”: <reason>` by the live engine.

export type LedgerKind = "Entry" | "Exit" | "Manual" | "Test";

export type LedgerInfo = { kind: LedgerKind; strategy: string | null; why: string };

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function orderLedgerInfo(o: { purpose: string; reason: string | null; side: "BUY" | "SELL" }): LedgerInfo {
  const m = /^Strategy [“"](.+?)[”"]:\s*(.*)$/.exec(o.reason ?? "");
  const strategy = m ? m[1] : null;
  const rest = (m ? m[2] : (o.reason ?? "")).trim();
  const kind: LedgerKind = o.purpose === "test" ? "Test" : o.purpose === "exit" ? "Exit" : o.purpose === "entry" || o.purpose === "strategy" ? "Entry" : "Manual";
  // A strategy order that sells (or buys back) is an exit even when it is filed as a strategy order.
  const isExit = kind === "Exit" || (kind === "Entry" && /^(exit|target|stop|trailing|intraday square|the maximum|the stop moved|a setup of the other)/i.test(rest));
  const final: LedgerKind = isExit ? "Exit" : kind;
  const why = rest
    ? final === "Exit"
      ? `Closed because of ${/^(exit rule|stop-loss|target \d?|trailing stop|intraday square-off)/i.test(rest) || /^closed by you/i.test(rest) ? rest.replace(/^closed by you$/i, "you closed it") : rest}`
      : sentence(rest)
    : final === "Manual"
      ? "Placed by you"
      : final === "Test"
        ? "Connection check"
        : "";
  return { kind: final, strategy, why: final === "Exit" && /^closed because of you closed it$/i.test(why) ? "You closed it from Live Trading" : why };
}

/** IST calendar day (YYYY-MM-DD) of an instant, for grouping the ledger by day. */
export const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Midnight IST today, as an instant. */
export function istToday(now = Date.now()): Date {
  const ist = new Date(now + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}
