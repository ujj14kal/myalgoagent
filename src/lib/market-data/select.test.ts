import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllowlist, selectProvider, type ProviderChoice } from "./select";
import type { MarketDataProvider } from "./types";

const yahoo = { name: "Yahoo", isOfficial: false, getHistoricalCandles: async () => [] } as MarketDataProvider;
const licensed = { name: "Licensed", isOfficial: true, getHistoricalCandles: async () => [] } as MarketDataProvider;
const base: ProviderChoice = { userId: "owner", use: "view", licensed, allowlist: new Set(["owner"]), licensedForTrading: false, fallback: yahoo };

describe("selectProvider — licensed data only for allow-listed accounts", () => {
  it("gives the licensed feed to an allow-listed user for charts and backtests", () => {
    expect(selectProvider(base)).toBe(licensed);
    expect(selectProvider({ ...base, use: "backtest" })).toBe(licensed);
  });

  it("never gives it to anyone else", () => {
    expect(selectProvider({ ...base, userId: "someone-else" })).toBe(yahoo);
    expect(selectProvider({ ...base, userId: null })).toBe(yahoo);
    expect(selectProvider({ ...base, userId: undefined })).toBe(yahoo);
    expect(selectProvider({ ...base, userId: "" })).toBe(yahoo);
    expect(selectProvider({ ...base, allowlist: new Set() })).toBe(yahoo);
  });

  it("falls back when the licensed feed isn't configured", () => {
    expect(selectProvider({ ...base, licensed: null })).toBe(yahoo);
  });

  it("keeps trading paths on the fallback unless explicitly enabled", () => {
    expect(selectProvider({ ...base, use: "trading" })).toBe(yahoo);
    expect(selectProvider({ ...base, use: "trading", licensedForTrading: true })).toBe(licensed);
    expect(selectProvider({ ...base, use: "trading", licensedForTrading: true, userId: "someone-else" })).toBe(yahoo);
  });

  it("parses the allow-list strictly", () => {
    expect([...parseAllowlist(" a , b,,  ")]).toEqual(["a", "b"]);
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
  });
});

describe("no code bypasses the selector", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && !p.includes(join("lib", "market-data"))) files.push(p);
    }
  };
  walk(join(process.cwd(), "src"));

  it("only market-data/index.ts imports a provider directly", () => {
    const offenders = files.filter((p) => /market-data\/providers\//.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
