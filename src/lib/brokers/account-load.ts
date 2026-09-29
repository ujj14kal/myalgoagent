import "server-only";
import { BrokerError } from "./adapters";
import { describeFailure } from "./failures";
import { brokerById } from "./catalog";
import type { LiveCtx } from "./live-brokers";
import { ACCOUNT_READERS, type AccountFunds, type AccountHolding, type AccountOrder, type AccountPosition, type AccountProfile, type AccountTrade } from "./account-data";
import { session, LiveCheckError } from "@/lib/live/orders";
import { logWarn } from "@/lib/logger";

export type Section<T> = { ok: true; data: T } | { ok: false; error: string } | null;
export type BrokerAccount = {
  broker: string;
  name: string;
  profile: Section<AccountProfile>;
  funds: Section<AccountFunds>;
  holdings: Section<AccountHolding[]>;
  positions: Section<AccountPosition[]>;
  orders: Section<AccountOrder[]>;
  trades: Section<AccountTrade[]>;
};

/** Everything the broker's API shares about the user's account; each part loads (or fails) on its own. */
export async function loadBrokerAccount(userId: string, broker: string): Promise<BrokerAccount | { error: string }> {
  const name = brokerById(broker)?.name ?? broker;
  const reader = ACCOUNT_READERS[broker as keyof typeof ACCOUNT_READERS];
  if (!reader) return { error: `Reading account data from ${name} isn't available yet.` };
  let ctx: LiveCtx;
  try {
    ctx = await session(userId, broker);
  } catch (err) {
    return { error: err instanceof LiveCheckError ? err.message : `Couldn't open your ${name} session.` };
  }
  const run = async <T,>(fn: ((c: LiveCtx) => Promise<T>) | undefined, part: string): Promise<Section<T>> => {
    if (!fn) return null;
    try {
      return { ok: true, data: await fn(ctx) };
    } catch (err) {
      if (err instanceof BrokerError) {
        logWarn("broker.account", err.failure.code, { broker, part, detail: err.failure.detail });
        const d = describeFailure(err.failure, name);
        return { ok: false, error: err.failure.detail ?? d.title };
      }
      logWarn("broker.account", "read failed", { broker, part, error: String(err) });
      return { ok: false, error: "Couldn't read this from the broker." };
    }
  };
  const [profile, funds, holdings, positions, orders, trades] = await Promise.all([
    run(reader.profile, "profile"),
    run(reader.funds, "funds"),
    run(reader.holdings, "holdings"),
    run(reader.positions, "positions"),
    run(reader.orders, "orders"),
    run(reader.trades, "trades"),
  ]);
  return { broker, name, profile, funds, holdings, positions, orders, trades };
}
