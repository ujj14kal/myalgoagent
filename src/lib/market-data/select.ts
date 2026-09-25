import type { MarketDataProvider } from "./types";

/** What the data is for. Trading paths match candles by exact timestamp across syncs, so they only switch source deliberately. */
export type MarketDataUse = "view" | "backtest" | "trading";

export type ProviderChoice = {
  userId: string | null | undefined;
  use: MarketDataUse;
  /** The licensed feed, or null when it isn't configured. */
  licensed: MarketDataProvider | null;
  /** User ids allowed to receive the licensed feed. */
  allowlist: ReadonlySet<string>;
  /** Whether trading paths (paper sessions, webhooks, positions) may use the licensed feed too. */
  licensedForTrading: boolean;
  fallback: MarketDataProvider;
};

/**
 * Fails closed: the licensed feed only for an allow-listed signed-in user
 * (and, for trading paths, only when explicitly enabled). Everyone and
 * everything else — including unknown users — gets the fallback.
 */
export function selectProvider(c: ProviderChoice): MarketDataProvider {
  if (!c.licensed || !c.userId || !c.allowlist.has(c.userId)) return c.fallback;
  if (c.use === "trading" && !c.licensedForTrading) return c.fallback;
  return c.licensed;
}

/** Comma-separated ids from an env var → a set (blank entries ignored). */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}
