import "server-only";
import { cached } from "@/lib/jobs";
import { logWarn } from "@/lib/logger";
import { brokerById, type BrokerId } from "./catalog";
import { BrokerError } from "./adapters";
import { CANDLE_SOURCES, NO_CANDLES_REASON } from "./broker-candles";
import { BrokerDataUnavailable, brokerCandles } from "./broker-data";

// Does this user's broker give us market data? Checked through the user's OWN connection with one
// small read-only candle request (no order), so a user who buys their broker's data plan is picked
// up automatically — on the next check, or straight away with "Check again".

export type DataAccessStatus = "available" | "no_plan" | "logged_out" | "not_supported" | "error";
export type DataAccess = { status: DataAccessStatus; detail: string; checkedAt: string };

const TTL_MS = 6 * 3_600_000;

/** Where to switch data on, per broker that charges for it (from each broker's pricing pages, Oct 2026). */
export const DATA_PLAN_HINT: Partial<Record<BrokerId, string>> = {
  groww: "Groww's free API plan doesn't include market data. Activate the Trading API plan (₹499/month + GST) in Groww Cloud, then check again.",
  zerodha: "Kite Connect's free Personal plan doesn't include market data. Switch the app to the Connect plan (₹500/month) on developers.kite.trade, then check again.",
  dhan: "Dhan's market data needs its Data APIs plan (₹499/month). Activate it in your Dhan account, then check again.",
};

async function probe(userId: string, broker: BrokerId): Promise<DataAccess> {
  const name = brokerById(broker)?.name ?? broker;
  const at = new Date().toISOString();
  if (!CANDLE_SOURCES[broker]) return { status: "not_supported", detail: NO_CANDLES_REASON[broker] ?? `${name} doesn't supply market data here yet.`, checkedAt: at };
  const { session } = await import("@/lib/live/orders");
  let ctx;
  try {
    ctx = await session(userId, broker);
  } catch {
    return { status: "logged_out", detail: `Log in to ${name} for today, then check again.`, checkedAt: at };
  }
  try {
    const candles = await brokerCandles(broker, ctx, "RELIANCE.NS", "1d", "1m");
    return { status: "available", detail: `${name} supplies market data on your account (${candles.length} one-minute candles read for RELIANCE). Your charts, backtests and new live strategies use it.`, checkedAt: at };
  } catch (err) {
    if (err instanceof BrokerDataUnavailable && err.reason === "no_access") return { status: "no_plan", detail: DATA_PLAN_HINT[broker] ?? err.message, checkedAt: at };
    logWarn("broker.data-access", err instanceof Error ? err.message : String(err), { broker });
    const why = err instanceof BrokerError ? (err.failure.detail ?? err.failure.code) : err instanceof Error ? err.message : "no answer";
    return { status: "error", detail: `Couldn't check ${name}'s market data just now (${why}). Try again in a minute.`, checkedAt: at };
  }
}

class Transient extends Error {
  constructor(readonly result: DataAccess) {
    super(result.status);
  }
}
const firm = (r: DataAccess) => r.status === "available" || r.status === "no_plan" || r.status === "not_supported";

/** The user's data access at this broker: a firm answer is kept for 6 hours, `refresh` checks again now; logged-out or failed checks are never kept. */
export async function dataAccess(userId: string, broker: BrokerId, opts: { refresh?: boolean } = {}): Promise<DataAccess> {
  const load = async () => {
    const r = await probe(userId, broker);
    if (!firm(r)) throw new Transient(r);
    return r;
  };
  try {
    return (await cached(`data-access:${userId}:${broker}`, TTL_MS, load, { refresh: opts.refresh })).value;
  } catch (err) {
    if (err instanceof Transient) return err.result;
    throw err;
  }
}
