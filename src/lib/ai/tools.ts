import { prisma } from "@/lib/prisma";
import { registeredStaticIp } from "@/lib/brokers/egress";
import { BROKERS, brokerById, callbackUrl } from "@/lib/brokers/catalog";
import { decodeFailure, describeFailure } from "@/lib/brokers/failures";
import { callbackOrigin } from "@/lib/brokers/service";
import { getPaperSessionRows } from "@/lib/portfolio";
import { compile } from "@/lib/strategy-compile";
import { isNeverExitCondition, type ConditionNode } from "@/lib/strategy/types";
import { conditionToText } from "@/lib/strategy/format";
import { CONDITION_REFERENCE, fillCustomRefs, toConditionNode } from "./conditions";
import { describeCustom, type CustomIndicatorDef } from "@/lib/custom-indicator";
import { FormulaError, parseFormula } from "@/lib/custom-indicator/formula";
import type { MantleTool } from "./mantle";
import { getBrokerAccount, getMarketOverview, getOptionChainSummary, getQuote } from "./market-tools";
import { NEW_STRATEGY_ID, toStrategyInput, type AgentProposal, type PlanStep, type RiskUnitName, type SizingModeName } from "./proposals";
import { DEFAULT_SQUARE_OFF_MINUTE } from "@/lib/strategy/session";
import { targetsFrom } from "./targets-arg";
import { describeTargets } from "@/lib/describe-targets";
import { parseTargets } from "@/lib/trading-engine/targets-config";
import { validateTargets } from "@/lib/trading-engine/step";

// Tools the agent can call. Read tools answer from the user's own data.
// "propose_*" tools never change anything: they validate a ready-to-run
// action and hand it to the chat as a proposal, which the user reviews in a
// modal and confirms (or edits / rejects). Every query is scoped to userId.



const backtestStepSchema = {
  type: "object",
  description: "Also backtest it in the same review (the user asked to test it)",
  properties: {
    period: { type: "string", enum: ["3mo", "6mo", "1y", "5y"] },
    starting_capital: { type: "number" },
    brokerage_percent: { type: "number" },
    slippage_percent: { type: "number" },
  },
};

const paperStepSchema = {
  type: "object",
  description: "Also start forward testing it in the same review (the user asked to run it forward / forward test it)",
  properties: {
    starting_capital: { type: "number" },
    brokerage_percent: { type: "number" },
    slippage_percent: { type: "number" },
    alert_only: { type: "boolean" },
  },
};

const riskLegSchema = {
  type: "object",
  properties: {
    value: { type: "number", description: "Distance, e.g. 2 for 2%" },
    unit: { type: "string", enum: ["PERCENT", "POINTS", "ATR_MULTIPLE"] },
  },
  required: ["value", "unit"],
};

const targetsSchema = {
  type: "array",
  maxItems: 3,
  description:
    "Staged targets, in order (Target 1, 2, 3). Each sells exit_percent of the ORIGINAL position when price reaches it, then locks profit on what is left: lock \"fixed\" = the rest is sold if price falls back to that target's own price; lock \"margin\" = the lock sits margin_value below it (above for a short), so price can pull back a little first. The total sold across targets is at most 100%; each target must be further from the entry than the one before; the lock never sits worse than the entry price. Use INSTEAD of take_profit, never together. Example: [{\"value\":5,\"unit\":\"PERCENT\",\"exit_percent\":25,\"lock\":\"fixed\"},{\"value\":10,\"unit\":\"PERCENT\",\"exit_percent\":25,\"lock\":\"margin\",\"margin_value\":1,\"margin_unit\":\"PERCENT\"}]. Not available for webhook strategies.",
  items: {
    type: "object",
    properties: {
      value: { type: "number", description: "Distance from the entry, e.g. 5 for 5%" },
      unit: { type: "string", enum: ["PERCENT", "POINTS", "ATR_MULTIPLE"] },
      exit_percent: { type: "number", description: "Share of the original position sold at this target, 1–100" },
      lock: { type: "string", enum: ["fixed", "margin"], description: "How profit is locked once this target is taken; default fixed" },
      margin_value: { type: "number", description: "Margin lock only: how far below the target (above, for a short) the lock sits" },
      margin_unit: { type: "string", enum: ["PERCENT", "POINTS", "ATR_MULTIPLE"], description: "Margin lock only; default = the target's unit" },
    },
    required: ["value", "unit", "exit_percent"],
  },
};

export const AGENT_TOOLS: MantleTool[] = [
  {
    type: "function",
    function: {
      name: "get_my_strategies",
      description: "List the user's strategies: name, instrument, status, direction, and their entry/exit rules and risk settings in plain words.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_backtests",
      description: "The user's most recent backtest results with their metrics.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "1-10, default 5" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_forward_tests",
      description: "The user's forward testing sessions with equity, P&L and status, plus the combined portfolio.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_risk_settings",
      description: "The user's current kill switch state and loss limits.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_events",
      description: "The user's recent notifications: hypothetical fills (with the rule that caused each), signals, risk events and stopped sessions. Use to explain what happened or give a summary of recent activity.",
      parameters: { type: "object", properties: { days: { type: "number", description: "Look-back in days, 1-30, default 7" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_broker_connection_guide",
      description:
        "How to connect a broker account, personalised: the exact steps for that broker, the Redirect URL to paste, which keys are needed, cost and daily-login rules, plus the user's current connection status and the plain-English reason if their last attempt failed. Call without a broker to get the list of brokers and which ones this user has already linked.",
      parameters: {
        type: "object",
        properties: { broker: { type: "string", description: "dhan, zerodha, upstox, fyers, angelone, groww, icicidirect, kotak, 5paisa or aliceblue (optional)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quote",
      description: "Latest price of a stock or index (live during market hours where the account has live data), day change, previous close, day and 52-week range, bid/ask. Use whenever the user asks about a price.",
      parameters: { type: "object", properties: { symbol: { type: "string", description: "e.g. RELIANCE, TCS, NIFTY, BANKNIFTY, SENSEX" } }, required: ["symbol"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_overview",
      description: "How the market is doing today: main indices, advances/declines, top gainers and losers, most traded stocks.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_option_chain",
      description: "An option chain in brief (live-data accounts): spot, PCR, max pain, ATM IV and prices/OI for strikes around the money.",
      parameters: { type: "object", properties: { underlying: { type: "string", description: "NIFTY, BANKNIFTY or an F&O stock like RELIANCE" }, expiry: { type: "string", description: "yyyy-mm-dd; nearest if omitted" } }, required: ["underlying"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_broker_account",
      description: "The user's real broker account as their broker reports it now (read-only): funds/margin, holdings, positions, today's orders. Only when they ask about their account.",
      parameters: { type: "object", properties: { broker: { type: "string", description: "broker id (groww, zerodha, upstox…); first connected one if omitted" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_live_trading",
      description: "The user's live trading status (read-only): whether it's on, the static IP to register, each broker's login/readiness, their live strategies (mode, status, position, signals waiting) and today's live orders.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_custom_indicators",
      description: "The user's own custom indicators (name, formula or drawn line). Use them in strategy conditions as {\"custom\": \"<name>\"}.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_custom_indicator",
      description:
        "Turn a user's own trend/indicator idea into a formula and give them a link to review, preview on a chart and save it (nothing is saved until they press Save). Formula language: prices open/high/low/close/volume/hl2/hlc3/ohlc4; + - * / ^; comparisons and/or (true = 1); fn(source, length) for sma, ema, wma, rma, rsi, stdev, highest, lowest, sum, change, ref, roc; abs, sqrt, log, min, max, if(cond, a, b), crossover(a, b), crossunder(a, b); and any built-in indicator by its strategy-language name with numeric settings, e.g. atr(14), supertrend(10, 3), vwap(). Example: (close - sma(close, 50)) / atr(14).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          formula: { type: "string" },
          pane: { type: "string", enum: ["price", "separate"], description: "price = drawn on the candles (same units as price); separate = its own pane (ratios, scores, 0/1 flags)." },
          description: { type: "string", description: "One sentence: what it measures." },
        },
        required: ["name", "formula", "pane"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_instruments",
      description: "Search the platform's instruments (every NSE-listed stock plus the main indices). Pass what the user said — a symbol, company name or part of one — and use an exact symbol from the results.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Symbol or company name, e.g. 'infosys', 'TATA', 'nifty bank'. Omit to get the most-used large caps." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_strategy",
      description:
        "Prepare a new strategy for the user to review and confirm in a pop-up (nothing is saved until they confirm). Use whenever the user describes a strategy or asks you to build/create one. It can express everything the visual builder can.\n" +
        CONDITION_REFERENCE,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          instrument_symbol: { type: "string", description: "NSE symbol like RELIANCE.NS; omit if the user didn't say" },
          direction: { type: "string", enum: ["LONG", "SHORT"] },
          entry: { anyOf: [{ type: "string" }, { type: "object" }], description: "Entry condition (see CONDITIONS)" },
          exit: { anyOf: [{ type: "string" }, { type: "object" }, { type: "null" }], description: "Exit condition (see CONDITIONS); null = no rule-based exit (needs a stop-loss, take-profit or trailing stop)" },
          max_entries: { type: "number", description: "Max entries per position (pyramiding); default 1" },
          timeframe: { type: "string", enum: ["1m", "3m", "5m", "15m", "30m", "60m", "4h", "1d"], description: "Candle timeframe the strategy runs on. Use an intraday one (1m–4h) whenever the rules involve times of day; default 1d." },
          no_entry_after: { type: ["string", "null"], description: "Intraday only: no new entries at/after this IST time, e.g. \"14:30\"" },
          product: { type: "string", enum: ["intraday", "delivery"], description: "Intraday (squared off the same day; needs a 1m–4h timeframe; required for short selling) or delivery (may be held overnight, long only). Default: intraday for intraday timeframes, delivery for 1d. MTF isn't available yet." },
          order_type: { type: "string", enum: ["market", "limit"], description: "Entry order type; default market" },
          limit_percent: { type: "number", description: "Limit entries: % better than the signal candle's close (buy below / short above), e.g. 0.2" },
          limit_price: { type: "number", description: "Limit entries: a fixed ₹ price instead of a %" },
          square_off_at: { type: ["string", "null"], description: "Intraday only: close open positions at this IST time, e.g. \"15:15\" (default 15:15 for intraday — many brokers only allow intraday until then; positions are never carried overnight)" },
          stop_loss: riskLegSchema,
          take_profit: riskLegSchema,
          targets: targetsSchema,
          trailing_stop: riskLegSchema,
          position_sizing: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ["FULL_CAPITAL", "FIXED_QUANTITY", "FIXED_CAPITAL", "PERCENT_OF_CAPITAL"] },
              value: { type: "number", description: "Shares, rupees or percent, depending on mode; omit for FULL_CAPITAL" },
            },
            required: ["mode"],
          },
          also_backtest: backtestStepSchema,
          also_forward_test: paperStepSchema,
        },
        required: ["name", "direction", "entry"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_backtest",
      description: "Prepare a backtest of one of the user's strategies for them to confirm. Defaults: 1 year, ₹1,00,000, 0.03% brokerage, 0.05% slippage.",
      parameters: {
        type: "object",
        properties: {
          strategy: { type: "string", description: "Strategy name (or id) from get_my_strategies" },
          period: { type: "string", enum: ["3mo", "6mo", "1y", "5y"] },
          starting_capital: { type: "number" },
          brokerage_percent: { type: "number" },
          slippage_percent: { type: "number" },
          also_forward_test: paperStepSchema,
        },
        required: ["strategy"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_forward_test",
      description: "Prepare a forward testing session (notional capital) for one of the user's strategies, for them to confirm. Defaults: ₹1,00,000, 0.03% brokerage, 0.05% slippage.",
      parameters: {
        type: "object",
        properties: {
          strategy: { type: "string", description: "Strategy name (or id)" },
          starting_capital: { type: "number" },
          brokerage_percent: { type: "number" },
          slippage_percent: { type: "number" },
          alert_only: { type: "boolean", description: "Only alert on signals, don't simulate trades" },
        },
        required: ["strategy"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_risk_limits",
      description: "Prepare new loss limits for the user to confirm. Omitted fields keep their current value; use null to remove a limit.",
      parameters: {
        type: "object",
        properties: {
          max_loss_percent: { type: ["number", "null"], description: "Max loss per forward test, % of its starting capital" },
          max_consecutive_losses: { type: ["number", "null"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_kill_switch",
      description: "Prepare turning the global kill switch on (halt: no new positions) or off, for the user to confirm.",
      parameters: { type: "object", properties: { enabled: { type: "boolean" } }, required: ["enabled"] },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_watchlist_add",
      description: "Prepare adding an instrument to the user's watchlist, for them to confirm.",
      parameters: { type: "object", properties: { instrument_symbol: { type: "string" } }, required: ["instrument_symbol"] },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_watchlist_remove",
      description: "Prepare removing an instrument from the user's watchlist, for them to confirm.",
      parameters: { type: "object", properties: { instrument_symbol: { type: "string" } }, required: ["instrument_symbol"] },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_forward_test_action",
      description:
        "Prepare syncing (update with the latest end-of-day data), pausing, resuming or stopping one of the user's forward tests, for them to confirm. Get session ids from get_my_forward_tests.",
      parameters: {
        type: "object",
        properties: {
          session: { type: "string", description: "Session id, or the strategy name it runs" },
          action: { type: "string", enum: ["sync", "pause", "resume", "stop"] },
        },
        required: ["session", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_strategy_update",
      description:
        "Prepare changes to one of the user's existing strategies (rules, risk rules, sizing, name, instrument, direction, max entries) for them to review and confirm. Pass only what changes; everything else stays as saved. Use the same CONDITIONS format as propose_strategy for entry/exit; a new entry/exit replaces the old one entirely.",
      parameters: {
        type: "object",
        properties: {
          strategy: { type: "string", description: "The strategy's current name (or id)" },
          new_name: { type: "string" },
          instrument_symbol: { type: "string" },
          direction: { type: "string", enum: ["LONG", "SHORT"] },
          entry: { anyOf: [{ type: "string" }, { type: "object" }], description: "Replaces the whole entry rule" },
          exit: { anyOf: [{ type: "string" }, { type: "object" }, { type: "null" }], description: "Replaces the whole exit rule; null removes it" },
          add_to_entry: { anyOf: [{ type: "string" }, { type: "object" }], description: "A condition that must ALSO be true to enter — kept together with the saved entry rule (e.g. a time window filter). No need to know the saved rule." },
          add_to_exit: { anyOf: [{ type: "string" }, { type: "object" }], description: "An extra condition that ALSO closes the position (OR-ed with the saved exit rule)." },
          stop_loss: { anyOf: [riskLegSchema, { type: "null" }], description: "null removes it" },
          take_profit: { anyOf: [riskLegSchema, { type: "null" }], description: "null removes it" },
          targets: { anyOf: [targetsSchema, { type: "null" }], description: "Replaces the staged Target 1–3 entirely; null removes them. Omit to keep the saved ones. A strategy has either targets or a take_profit, never both — setting one of them requires clearing the other." },
          trailing_stop: { anyOf: [riskLegSchema, { type: "null" }], description: "null removes it" },
          position_sizing: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ["FULL_CAPITAL", "FIXED_QUANTITY", "FIXED_CAPITAL", "PERCENT_OF_CAPITAL"] },
              value: { type: "number" },
            },
          },
          max_entries: { type: "number" },
          timeframe: { type: "string", enum: ["1m", "3m", "5m", "15m", "30m", "60m", "4h", "1d"], description: "Candle timeframe the strategy runs on. Use an intraday one (1m–4h) whenever the rules involve times of day; default 1d." },
          no_entry_after: { type: ["string", "null"], description: "Intraday only: no new entries at/after this IST time, e.g. \"14:30\"" },
          product: { type: "string", enum: ["intraday", "delivery"], description: "Intraday (squared off the same day; needs a 1m–4h timeframe; required for short selling) or delivery (may be held overnight, long only). Default: intraday for intraday timeframes, delivery for 1d. MTF isn't available yet." },
          order_type: { type: "string", enum: ["market", "limit"], description: "Entry order type; default market" },
          limit_percent: { type: "number", description: "Limit entries: % better than the signal candle's close (buy below / short above), e.g. 0.2" },
          limit_price: { type: "number", description: "Limit entries: a fixed ₹ price instead of a %" },
          square_off_at: { type: ["string", "null"], description: "Intraday only: close open positions at this IST time, e.g. \"15:15\" (default 15:15 for intraday — many brokers only allow intraday until then; positions are never carried overnight)" },
        },
        required: ["strategy"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_strategy_archive",
      description: "Prepare archiving one of the user's strategies (it can be restored later), for them to confirm.",
      parameters: { type: "object", properties: { strategy: { type: "string" } }, required: ["strategy"] },
    },
  },
];

export type ToolOutcome = { result: unknown; proposal?: AgentProposal };

const DEFAULTS = { startingCapital: 100000, brokeragePercent: 0.03, slippagePercent: 0.05 };
const RANGES = new Set(["3mo", "6mo", "1y", "5y"]);

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

async function findInstrument(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (!s) return null;
  return prisma.instrument.findFirst({
    where: { OR: [{ symbol: s }, { symbol: `${s}.NS` }, { symbol: s.replace(/\.NS$/, "") + ".NS" }] },
    select: { id: true, symbol: true, name: true },
  });
}

type StrategyMatch = { id: string; name: string; instrument: { symbol: string } };

/**
 * An exact id or name match, or a single partial match. Several partial
 * matches are returned as `ambiguous` so the agent asks which one — it never
 * guesses between the user's strategies.
 */
async function findStrategy(userId: string, ref: string): Promise<StrategyMatch | { ambiguous: string[] } | null> {
  const r = ref.trim();
  if (!r) return null;
  const select = { id: true, name: true, instrument: { select: { symbol: true } } } as const;
  const exact =
    (await prisma.strategy.findFirst({ where: { id: r, userId, status: { not: "DELETED" } }, select })) ??
    (await prisma.strategy.findFirst({ where: { userId, nameNormalized: r.toLowerCase(), status: { not: "DELETED" } }, select }));
  if (exact) return exact;
  const partial = await prisma.strategy.findMany({
    where: { userId, name: { contains: r, mode: "insensitive" }, status: { in: ["DRAFT", "ACTIVE"] } },
    orderBy: { updatedAt: "desc" },
    take: 6,
    select,
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return { ambiguous: partial.map((p) => `${p.name} (${p.instrument.symbol})`) };
  return null;
}

const ambiguityResult = (options: string[]) => ({
  result: {
    ambiguous: true,
    options,
    note: "Several strategies match. Ask the user which one they mean (list these names briefly); do not pick one yourself.",
  },
});

async function uniqueStrategyName(userId: string, name: string): Promise<string> {
  let candidate = name.trim().slice(0, 80) || "New strategy";
  for (let n = 2; n < 50; n++) {
    const taken = await prisma.strategy.findFirst({ where: { userId, nameNormalized: candidate.toLowerCase() }, select: { id: true } });
    if (!taken) return candidate;
    candidate = `${name.trim().slice(0, 74)} (${n})`;
  }
  return candidate;
}

function leg(v: unknown): { enabled: boolean; unit: RiskUnitName; value: number } {
  const o = (v ?? {}) as { value?: unknown; unit?: unknown };
  const value = num(o.value);
  const unit = o.unit === "POINTS" || o.unit === "ATR_MULTIPLE" ? o.unit : "PERCENT";
  return value && value > 0 ? { enabled: true, unit, value } : { enabled: false, unit: "PERCENT", value: 0 };
}

type StrategyRef = { strategyId: string; strategyName: string; instrumentSymbol: string };

function runCosts(o: Record<string, unknown>) {
  const capital = num(o.starting_capital);
  return {
    startingCapital: capital && capital > 0 ? capital : DEFAULTS.startingCapital,
    brokeragePercent: num(o.brokerage_percent) ?? DEFAULTS.brokeragePercent,
    slippagePercent: num(o.slippage_percent) ?? DEFAULTS.slippagePercent,
  };
}

function backtestStep(ref: StrategyRef, o: Record<string, unknown>): PlanStep {
  const period = str(o.period);
  return {
    kind: "backtest",
    status: "pending",
    draft: { ...ref, ...runCosts(o), range: RANGES.has(period) ? (period as "3mo" | "6mo" | "1y" | "5y") : "1y" },
  };
}

function paperStep(ref: StrategyRef, o: Record<string, unknown>): PlanStep {
  return { kind: "paper_session", status: "pending", draft: { ...ref, ...runCosts(o), alertOnly: o.alert_only === true } };
}

const asObject = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

/** A single proposal, or a plan when the user asked for follow-up steps too. */
function withFollowUps(first: PlanStep, ref: StrategyRef, a: Record<string, unknown>): { proposal: AgentProposal; steps: number } {
  const steps: PlanStep[] = [first];
  const bt = asObject(a.also_backtest);
  const pt = asObject(a.also_forward_test);
  if (bt && first.kind !== "backtest") steps.push(backtestStep(ref, bt));
  if (pt) steps.push(paperStep(ref, pt));
  return steps.length === 1 ? { proposal: first, steps: 1 } : { proposal: { kind: "plan", status: "pending", steps }, steps: steps.length };
}

/** The validator's collected-issues JSON (or a plain message) as one readable sentence for the agent. */
function readableIssues(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    const issues = JSON.parse(msg) as { section?: string; message?: string }[];
    if (Array.isArray(issues)) return issues.map((i) => `${i.section ? `[${i.section}] ` : ""}${i.message}`).join(" ");
  } catch {
    /* plain message */
  }
  return msg;
}

type StrategyDraft = Extract<AgentProposal, { kind: "strategy" }>["draft"];

const hasRiskLeg = (d: StrategyDraft) => d.stopLoss.enabled || d.target.enabled || d.trailingSl.enabled || !!d.targets?.length;

function sizingFrom(v: unknown, fallback?: { mode: SizingModeName; value: number | null }) {
  const sizing = asObject(v);
  if (!sizing) return fallback ?? { mode: "FULL_CAPITAL" as SizingModeName, value: null };
  const mode: SizingModeName =
    sizing.mode === "FIXED_QUANTITY" || sizing.mode === "FIXED_CAPITAL" || sizing.mode === "PERCENT_OF_CAPITAL" ? sizing.mode : "FULL_CAPITAL";
  return { mode, value: mode === "FULL_CAPITAL" ? null : num(sizing.value) ?? null };
}

/** "14:30" / "2:30 pm" → IST minute of day; null/"" → null; undefined when absent. */
function clockArg(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "" || (typeof v === "string" && /^(none|off|no)$/i.test(v.trim()))) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(String(v).trim());
  if (!m) throw new Error(`time "${String(v)}" should look like 14:30.`);
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

const STRATEGY_TF = ["1m", "3m", "5m", "15m", "30m", "60m", "4h", "1d"];

/** product / order_type / limit_* arguments → the saved order fields (undefined = unchanged). */
function orderArgs(a: Record<string, unknown>) {
  const out: { productType?: string; orderType?: string; limitMode?: string | null; limitValue?: number | null } = {};
  const product = String(a.product ?? "").toLowerCase();
  if (product === "mtf") throw new Error("MTF (margin) orders aren't available yet — they'll come with broker integration. Use intraday or delivery.");
  if (product === "intraday" || product === "delivery") out.productType = product.toUpperCase();
  const pct = num(a.limit_percent);
  const price = num(a.limit_price);
  const type = String(a.order_type ?? "").toLowerCase();
  if (type === "market") Object.assign(out, { orderType: "MARKET", limitMode: null, limitValue: null });
  if (type === "limit" || pct !== undefined || price !== undefined) {
    if (price !== undefined) Object.assign(out, { orderType: "LIMIT", limitMode: "PRICE", limitValue: price });
    else if (pct !== undefined) Object.assign(out, { orderType: "LIMIT", limitMode: "PERCENT", limitValue: pct });
    else throw new Error("A limit order needs limit_percent (e.g. 0.2) or limit_price (in ₹).");
  }
  return out;
}
function timeframeArg(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const tf = String(v).toLowerCase().replace(/^1h$/, "60m");
  if (!STRATEGY_TF.includes(tf)) throw new Error(`timeframe "${String(v)}" isn't supported — use one of ${STRATEGY_TF.join(", ")}.`);
  return tf;
}

/** Looks up {custom: "name"} references in the user's saved custom indicators. */
async function withCustomDefs<T extends { entry?: ConditionNode; exit?: ConditionNode | null }>(userId: string, rules: T): Promise<T> {
  const text = JSON.stringify(rules);
  if (!text.includes('"custom"')) return rules;
  const rows = await prisma.customIndicator.findMany({ where: { userId }, select: { name: true, def: true } });
  const saved = new Map(rows.map((r) => [r.name, r.def as unknown as CustomIndicatorDef]));
  return {
    ...rules,
    ...(rules.entry ? { entry: fillCustomRefs(rules.entry, saved) } : {}),
    ...(rules.exit ? { exit: fillCustomRefs(rules.exit, saved) } : {}),
  };
}

/** Parses entry/exit; "exit": null / "none" means no rule-based exit. Throws readable errors. */
function rulesFrom(a: Record<string, unknown>, needEntry: boolean): { entry?: ConditionNode; exit?: ConditionNode | null } {
  const out: { entry?: ConditionNode; exit?: ConditionNode | null } = {};
  if (a.entry !== undefined && a.entry !== "") out.entry = toConditionNode(a.entry, "entry");
  else if (needEntry) throw new Error("entry: an entry condition is required.");
  if ("exit" in a) {
    const x = a.exit;
    out.exit = x === null || x === "" || (typeof x === "string" && /^(none|null|no exit)$/i.test(x.trim())) ? null : toConditionNode(x, "exit");
  }
  return out;
}

async function validateDraft(draft: StrategyDraft, webhook = false): Promise<string | null> {
  const staged = validateTargets(draft.targets, draft.target.enabled);
  if (staged) return staged;
  if (webhook && draft.targets?.length) return "Targets 1–3 aren't available for webhook strategies.";
  if (!webhook && draft.entryCondition && draft.exitCondition === null && !hasRiskLeg(draft)) {
    return "With no rule-based exit, the strategy needs a stop-loss, take-profit or trailing stop — otherwise a position could never close.";
  }
  try {
    const input = toStrategyInput(draft, draft.instrumentId ?? "pending");
    await compile(webhook ? { ...input, mode: "WEBHOOK" } : input);
    return null;
  } catch (err) {
    return readableIssues(err);
  }
}

async function proposeStrategy(userId: string, a: Record<string, unknown>): Promise<ToolOutcome> {
  const instrument = str(a.instrument_symbol) ? await findInstrument(str(a.instrument_symbol)) : null;
  if (str(a.instrument_symbol) && !instrument) {
    return { result: { error: `Unknown instrument "${str(a.instrument_symbol)}". Call list_instruments and use an exact symbol, or omit it so the user picks one.` } };
  }
  let rules;
  try {
    rules = await withCustomDefs(userId, rulesFrom(a, true));
  } catch (err) {
    return { result: { error: `${readableIssues(err)} Fix it and call propose_strategy again.` } };
  }
  let session;
  try {
    const timeframe = timeframeArg(a.timeframe) ?? "1d";
    const intraday = timeframe !== "1d";
    const noEntry = clockArg(a.no_entry_after);
    const squareOff = clockArg(a.square_off_at);
    const order = orderArgs(a);
    const productType = order.productType ?? (intraday ? "INTRADAY" : "DELIVERY");
    session = {
      timeframe,
      noEntryAfterMinute: intraday ? noEntry ?? null : null,
      squareOffMinute: intraday && productType === "INTRADAY" ? (squareOff === undefined ? DEFAULT_SQUARE_OFF_MINUTE : squareOff) : null,
      productType,
      orderType: order.orderType ?? "MARKET",
      limitMode: order.limitMode ?? null,
      limitValue: order.limitValue ?? null,
    };
  } catch (err) {
    return { result: { error: `${readableIssues(err)} Fix it and call propose_strategy again.` } };
  }
  const sizing = sizingFrom(a.position_sizing);
  let stagedTargets: ReturnType<typeof targetsFrom>;
  try {
    stagedTargets = targetsFrom(a.targets);
  } catch (err) {
    return { result: { error: `${readableIssues(err)} Fix it and call propose_strategy again.` } };
  }
  const draft: StrategyDraft = {
    name: await uniqueStrategyName(userId, str(a.name)),
    instrumentId: instrument?.id ?? null,
    instrumentSymbol: instrument?.symbol ?? null,
    direction: a.direction === "SHORT" ? "SHORT" : "LONG",
    entryCondition: rules.entry,
    exitCondition: rules.exit === undefined ? null : rules.exit,
    stopLoss: leg(a.stop_loss),
    target: leg(a.take_profit),
    trailingSl: leg(a.trailing_stop),
    ...(stagedTargets?.length ? { targets: stagedTargets } : {}),
    positionSizingMode: sizing.mode,
    positionSizingValue: sizing.value,
    maxPyramidEntries: Math.max(1, Math.floor(num(a.max_entries) ?? 1)),
    ...session,
  };

  // Same validator as the builder. Instrument isn't needed to check the rules,
  // so a placeholder stands in when the user hasn't picked one yet.
  const problem = await validateDraft(draft);
  if (problem) return { result: { error: `The strategy didn't pass validation: ${problem} Fix it and call propose_strategy again.` } };

  const planned = withFollowUps(
    { kind: "strategy", status: "pending", draft },
    { strategyId: NEW_STRATEGY_ID, strategyName: draft.name, instrumentSymbol: draft.instrumentSymbol ?? "" },
    a
  );
  return {
    result: {
      ok: true,
      steps: planned.steps,
      entry: conditionToText(draft.entryCondition!),
      exit: draft.exitCondition ? conditionToText(draft.exitCondition) : "no rule-based exit",
      note: "A review window is now open for the user. Briefly tell them what you prepared (and the follow-up steps, if any); do not repeat every field. Don't claim anything is done — they confirm it.",
      needsInstrument: !draft.instrumentId,
    },
    proposal: planned.proposal,
  };
}

/** Edits an existing strategy: starts from what's saved, applies only the requested changes. */
async function proposeStrategyUpdate(userId: string, a: Record<string, unknown>): Promise<ToolOutcome> {
  const found = await findStrategy(userId, str(a.strategy));
  if (!found) return { result: { error: `No strategy matches "${str(a.strategy)}". Ask the user which strategy they mean.` } };
  if ("ambiguous" in found) return ambiguityResult(found.ambiguous);
  const s = await prisma.strategy.findUnique({ where: { id: found.id }, include: { instrument: true } });
  if (!s) return { result: { error: "That strategy no longer exists." } };
  const webhook = s.mode === "WEBHOOK";

  let rules;
  try {
    rules = await withCustomDefs(userId, rulesFrom(a, false));
  } catch (err) {
    return { result: { error: `${readableIssues(err)} Fix it and call propose_strategy_update again.` } };
  }
  let addEntry: ConditionNode | undefined;
  let addExit: ConditionNode | undefined;
  try {
    if (a.add_to_entry != null && a.add_to_entry !== "") addEntry = toConditionNode(a.add_to_entry, "add_to_entry");
    if (a.add_to_exit != null && a.add_to_exit !== "") addExit = toConditionNode(a.add_to_exit, "add_to_exit");
  } catch (err) {
    return { result: { error: `${readableIssues(err)} Fix it and call propose_strategy_update again.` } };
  }
  if (webhook && (rules.entry || rules.exit !== undefined || addEntry || addExit)) {
    return { result: { error: "This strategy is TradingView-webhook driven — its entries and exits come from TradingView alerts, so its rules can't be changed here. Risk rules, sizing, name and direction can." } };
  }
  const instrument = str(a.instrument_symbol) ? await findInstrument(str(a.instrument_symbol)) : s.instrument;
  if (!instrument) return { result: { error: `Unknown instrument "${str(a.instrument_symbol)}". Call list_instruments.` } };

  // Code-mode strategies store the compiled tree too, so extending their rules works the same way.
  const savedEntry = s.entryCondition as unknown as ConditionNode;
  const savedExitRaw = s.exitCondition as unknown as ConditionNode;
  const savedExit = isNeverExitCondition(savedExitRaw) ? null : savedExitRaw;
  const baseEntry = rules.entry ?? savedEntry;
  const baseExit = rules.exit !== undefined ? rules.exit : savedExit;
  const nextEntry = addEntry ? { kind: "group" as const, op: "AND" as const, children: [addEntry, baseEntry] } : baseEntry;
  const nextExit = addExit ? (baseExit ? { kind: "group" as const, op: "OR" as const, children: [baseExit, addExit] } : addExit) : baseExit;
  const rulesChanged = rules.entry !== undefined || rules.exit !== undefined || !!addEntry || !!addExit;
  const legFrom = (enabled: boolean, unit: RiskUnitName | null, value: number | null) =>
    enabled && unit && value != null ? { enabled: true, unit, value } : { enabled: false, unit: "PERCENT" as RiskUnitName, value: 0 };
  const pickLeg = (key: string, saved: ReturnType<typeof legFrom>) =>
    key in a ? (a[key] === null ? { enabled: false, unit: "PERCENT" as RiskUnitName, value: 0 } : leg(a[key])) : saved;
  const sizing = sizingFrom(a.position_sizing, { mode: s.positionSizingMode, value: s.positionSizingValue });
  let nextTargets;
  try {
    // Omitted = keep the saved targets; null or an empty list removes them.
    nextTargets = targetsFrom(a.targets) ?? parseTargets(s.targetsConfig);
  } catch (err) {
    return { result: { error: `${readableIssues(err)} Fix it and call propose_strategy_update again.` } };
  }
  const newName = str(a.new_name);
  let updSession;
  try {
    const timeframe = timeframeArg(a.timeframe) ?? s.timeframe;
    const intraday = timeframe !== "1d";
    const noEntry = clockArg(a.no_entry_after);
    const squareOff = clockArg(a.square_off_at);
    const order = orderArgs(a);
    updSession = {
      productType: order.productType ?? (a.timeframe !== undefined && timeframe !== s.timeframe ? (intraday ? "INTRADAY" : "DELIVERY") : s.productType),
      orderType: order.orderType ?? s.orderType,
      limitMode: order.orderType !== undefined ? order.limitMode ?? null : s.limitMode,
      limitValue: order.orderType !== undefined ? order.limitValue ?? null : s.limitValue,
      timeframe,
      noEntryAfterMinute: intraday ? (noEntry === undefined ? s.noEntryAfterMinute : noEntry) : null,
      squareOffMinute: intraday ? (squareOff === undefined ? (s.squareOffMinute ?? (s.timeframe === "1d" ? DEFAULT_SQUARE_OFF_MINUTE : null)) : squareOff) : null,
    };
  } catch (err) {
    return { result: { error: `${readableIssues(err)} Fix it and call propose_strategy_update again.` } };
  }

  const draft: StrategyDraft = {
    name: newName || s.name,
    instrumentId: instrument.id,
    instrumentSymbol: instrument.symbol,
    direction: a.direction === "SHORT" || a.direction === "LONG" ? a.direction : s.direction,
    // Code-mode strategies keep their code unless the rules change; changed rules are saved as builder conditions.
    ...(s.mode === "CODE" && !rulesChanged
      ? { entrySource: s.entrySource ?? "", exitSource: s.exitSource ?? "" }
      : { entryCondition: nextEntry, exitCondition: nextExit }),
    stopLoss: pickLeg("stop_loss", legFrom(s.stopLossEnabled, s.stopLossUnit, s.stopLossValue)),
    target: pickLeg("take_profit", legFrom(s.targetEnabled, s.targetUnit, s.targetValue)),
    trailingSl: pickLeg("trailing_stop", legFrom(s.trailingSlEnabled, s.trailingSlUnit, s.trailingSlValue)),
    ...(nextTargets.length ? { targets: nextTargets } : {}),
    positionSizingMode: sizing.mode,
    positionSizingValue: sizing.value,
    maxPyramidEntries: Math.max(1, Math.floor(num(a.max_entries) ?? s.maxPyramidEntries)),
    ...updSession,
    ...(webhook ? { webhook: true } : {}),
  };
  if (newName && newName.toLowerCase() !== s.name.toLowerCase()) {
    const taken = await prisma.strategy.findFirst({ where: { userId, nameNormalized: newName.toLowerCase(), NOT: { id: s.id } }, select: { id: true } });
    if (taken) return { result: { error: `The user already has a strategy called "${newName}". Ask for a different name.` } };
  }
  const problem = await validateDraft(draft, webhook);
  if (problem) return { result: { error: `The change didn't pass validation: ${problem} Fix it and call propose_strategy_update again.` } };

  return {
    result: { ok: true, note: "A review window is open showing the updated strategy. Summarise what changes in one or two sentences." },
    proposal: { kind: "strategy_update", status: "pending", strategyId: s.id, draft },
  };
}

const BROKER_ALIASES: Record<string, string> = { "angel one": "angelone", angel: "angelone", kite: "zerodha", "icici direct": "icicidirect", icici: "icicidirect", "kotak neo": "kotak", "alice blue": "aliceblue", dhanhq: "dhan" };

const CONNECTION_STATE_TEXT = {
  connected: "connected, with today's session active",
  expired: "connected before, but today's session has ended — they only need to click “Log in for today”",
  keys_saved: "keys saved, but the broker login wasn't completed",
  error: "the last attempt failed",
} as const;

async function brokerGuide(userId: string, rawBroker?: string) {
  let rows: { broker: string; status: string; tokenExpiresAt: Date | null; accountName: string | null; brokerClientId: string | null; lastError: string | null; loginMethod: string | null }[] = [];
  try {
    rows = await prisma.brokerConnection.findMany({
      where: { userId },
      select: { broker: true, status: true, tokenExpiresAt: true, accountName: true, brokerClientId: true, lastError: true, loginMethod: true },
    });
  } catch {
    // Table not created yet on this environment — the guides still apply.
  }
  const now = new Date();
  const stateOf = (r: (typeof rows)[number]) =>
    r.status === "CONNECTED" ? (r.tokenExpiresAt && r.tokenExpiresAt > now ? "connected" : "expired") : r.status === "ERROR" ? "error" : "keys_saved";
  const origin = callbackOrigin();

  const key = rawBroker?.trim().toLowerCase();
  const info = key ? (brokerById(key) ?? brokerById(BROKER_ALIASES[key] ?? "") ?? BROKERS.find((b) => b.name.toLowerCase() === key)) : undefined;

  if (!info) {
    return {
      ...(key ? { note: `“${rawBroker}” isn't one of the brokers MyAlgoAgent supports yet.` } : {}),
      liveNow: BROKERS.filter((b) => b.availability === "live").map((b) => ({ broker: b.name, apiCost: b.apiCost, dailyLogin: b.session, keysNeeded: b.fields.map((f) => f.label) })),
      costNote: "Connecting through MyAlgoAgent is free — these are the brokers' own API prices. Brokerage per trade is separate, set by the user's broker plan, and not known here.",
      comingNext: BROKERS.filter((b) => b.availability === "next").map((b) => b.name),
      yourConnections: rows.map((r) => ({ broker: brokerById(r.broker)?.name ?? r.broker, status: CONNECTION_STATE_TEXT[stateOf(r)] })),
      page: "/app/broker-connections",
      howToUse: "Ask which broker they use (one question) unless they've said, then call this tool again with that broker.",
    };
  }

  const row = rows.find((r) => r.broker === info.id);
  const failure = row?.lastError ? decodeFailure(row.lastError) : null;
  const explained = failure ? describeFailure(failure, info.name) : null;
  const approval = info.flow === "approval";
  const redirectUrl = approval ? undefined : callbackUrl(origin, info.id);
  return {
    broker: info.name,
    availableNow: info.availability === "live",
    page: `/app/broker-connections?broker=${info.id}`,
    yourStatus: row
      ? {
          state: CONNECTION_STATE_TEXT[stateOf(row)],
          account: row.accountName ?? undefined,
          clientId: row.brokerClientId ?? undefined,
          dailyLoginMethod: row.loginMethod && info.altLogin?.id === row.loginMethod ? info.altLogin.label : (info.altLogin?.defaultLabel ?? "standard"),
          ...(explained && stateOf(row) !== "connected" ? { lastProblem: explained.title, why: explained.reason, fix: explained.steps, brokerSaid: failure?.detail } : {}),
        }
      : "not connected yet",
    createAppAt: info.portal.label,
    steps: info.steps.map((s) => (s === "PASTE_CALLBACK" ? `In the ${info.callbackFieldName} field paste exactly ${redirectUrl} (https, no slash at the end, no spaces).` : s)),
    ...(redirectUrl ? { redirectUrl } : { howDailyLoginWorks: `No Redirect URL. Each trading day the user approves the API key on ${info.portal.label}, then clicks "Connect for today" on our page.` }),
    keysToPasteOnOurPage: info.fields.map((f) => f.label),
    cost: info.cost,
    apiCost: info.apiCost,
    dailyLogin: info.session,
    notes: info.notes ?? [],
    ...(info.altLogin
      ? {
          dailyLoginChoice: {
            standard: `${info.altLogin.defaultLabel} — ${info.altLogin.defaultSummary}`,
            alternative: `${info.altLogin.label} — ${info.altLogin.summary}`,
            alternativeTradeoff: info.altLogin.tradeoff,
            alternativeKeysToPaste: info.altLogin.fields.map((f) => f.label),
            alternativeSteps: info.altLogin.steps.map((st) =>
              st === "PASTE_CALLBACK"
                ? `In the ${info.callbackFieldName} field paste exactly ${callbackUrl(origin, info.id)}.`
                : st === "PASTE_NOTIFIER"
                  ? "In the Notifier Webhook URL field paste the private URL shown on our Broker Connections page (unique to the user — never ask them to share it)."
                  : st,
            ),
            howToChoose: "The user picks it on the Broker Connections page under “How do you want to log in each day?”. Explain the trade-off honestly; don't push either.",
          },
        }
      : {}),
    liveOrders: "Rolling out account by account (see Live Trading). Real orders need the static IP shown on the Live Trading page registered on the user's broker account (a SEBI rule). 'Check I'm ready' verifies a broker without placing any order; 'Go Live' on a strategy page runs it live; its orders are sent automatically when its rules fire.",
  };
}

export async function runAgentTool(userId: string, name: string, rawArgs: string): Promise<ToolOutcome> {
  let a: Record<string, unknown> = {};
  try {
    a = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { result: { error: "Arguments were not valid JSON." } };
  }

  switch (name) {
    case "get_my_strategies": {
      const rows = await prisma.strategy.findMany({
        where: { userId, status: { not: "DELETED" } },
        orderBy: { updatedAt: "desc" },
        take: 25,
        include: { instrument: { select: { symbol: true } } },
      });
      const rule = (n: unknown) => {
        const node = n as ConditionNode | null;
        if (!node || isNeverExitCondition(node)) return "none";
        try {
          return conditionToText(node);
        } catch {
          return "unreadable";
        }
      };
      const legText = (on: boolean, unit: string | null, value: number | null) => (on && value != null ? `${value} ${unit === "PERCENT" ? "%" : unit === "POINTS" ? "points" : "× ATR"}` : "off");
      return {
        result: rows.map((r) => ({
          id: r.id,
          name: r.name,
          instrument: r.instrument.symbol,
          status: r.status,
          direction: r.direction,
          mode: r.mode,
          entry: r.mode === "WEBHOOK" ? "TradingView alerts" : rule(r.entryCondition),
          exit: r.mode === "WEBHOOK" ? "TradingView alerts" : rule(r.exitCondition),
          stopLoss: legText(r.stopLossEnabled, r.stopLossUnit, r.stopLossValue),
          takeProfit: legText(r.targetEnabled, r.targetUnit, r.targetValue),
          targets: describeTargets(parseTargets(r.targetsConfig)),
          trailingStop: legText(r.trailingSlEnabled, r.trailingSlUnit, r.trailingSlValue),
          sizing: r.positionSizingMode + (r.positionSizingValue != null ? ` ${r.positionSizingValue}` : ""),
          maxEntries: r.maxPyramidEntries,
          timeframe: r.timeframe,
          noEntryAfter: r.noEntryAfterMinute,
          squareOffAt: r.squareOffMinute,
          product: r.productType,
          entryOrder: r.orderType === "LIMIT" ? `limit ${r.limitMode === "PRICE" ? `₹${r.limitValue}` : `${r.limitValue}% from signal price`}` : "market",
        })),
      };
    }
    case "get_my_backtests": {
      const limit = Math.min(Math.max(num(a.limit) ?? 5, 1), 10);
      const rows = await prisma.backtestRun.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true, strategyName: true, instrumentSymbol: true, range: true, startingCapital: true, totalReturnPct: true, cagrPct: true,
          winRatePct: true, profitFactor: true, maxDrawdownPct: true, sharpeRatio: true, tradeCount: true, createdAt: true,
        },
      });
      return { result: rows.map((r) => ({ ...r, link: `/app/backtests/${r.id}`, createdAt: r.createdAt.toISOString().slice(0, 10) })) };
    }
    case "get_my_forward_tests": {
      // Each forward test on its own — hypothetical results per strategy, never pooled into an account.
      const rows = await getPaperSessionRows(userId);
      return {
        result: {
          note: "Hypothetical results, one per strategy. Don't add them up into a portfolio or balance.",
          sessions: rows.slice(0, 15).map((r) => ({
            id: r.session.id, strategy: r.session.strategyName, instrument: r.session.instrumentSymbol, status: r.session.status,
            notionalCapital: r.session.startingCapital, notionalValue: Math.round(r.equity), pnlPct: Number(r.pnlPct.toFixed(2)),
            inPosition: r.session.positionQuantity != null, link: `/app/forward-testing/${r.session.id}`,
          })),
        },
      };
    }
    case "get_risk_settings": {
      const r = await prisma.riskSettings.findUnique({ where: { userId } });
      return { result: { killSwitchEnabled: r?.killSwitchEnabled ?? false, maxLossPercent: r?.maxLossPercent ?? null, maxConsecutiveLosses: r?.maxConsecutiveLosses ?? null } };
    }
    case "get_recent_events": {
      const days = Math.min(Math.max(num(a.days) ?? 7, 1), 30);
      const rows = await prisma.notification.findMany({
        where: { userId, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { type: true, message: true, createdAt: true, paperSessionId: true },
      });
      return {
        result: rows.map((r) => ({
          type: r.type,
          message: r.message,
          at: r.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " IST",
          link: r.paperSessionId ? `/app/forward-testing/${r.paperSessionId}` : null,
        })),
      };
    }
    case "get_broker_connection_guide":
      return { result: await brokerGuide(userId, typeof a.broker === "string" ? a.broker : undefined) };
    case "get_quote":
      return { result: await getQuote(userId, str(a.symbol)).catch(() => ({ error: "Couldn't load that price right now." })) };
    case "get_market_overview":
      return { result: await getMarketOverview(userId).catch(() => ({ error: "Couldn't load the market overview right now." })) };
    case "get_option_chain":
      return { result: await getOptionChainSummary(userId, str(a.underlying), str(a.expiry) || undefined).catch(() => ({ error: "Couldn't load the option chain right now." })) };
    case "get_my_broker_account":
      return { result: await getBrokerAccount(userId, str(a.broker) || undefined).catch(() => ({ error: "Couldn't read the broker account right now." })) };
    case "get_my_live_trading": {
      const [u, conns, deps, orders] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { liveTradingEnabledAt: true, liveStaticIp: true } }),
        prisma.brokerConnection.findMany({ where: { userId }, select: { broker: true, status: true, tokenExpiresAt: true, liveReadyAt: true } }),
        prisma.liveDeployment.findMany({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } }, select: { strategyName: true, instrumentSymbol: true, broker: true, mode: true, status: true, positionQty: true, positionAvgPrice: true, pendingSignals: true, lastError: true } }),
        prisma.liveOrder.findMany({ where: { userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 10, select: { side: true, quantity: true, tradingSymbol: true, status: true, filledQuantity: true, averagePrice: true, createdAt: true } }),
      ]);
      const now = Date.now();
      return {
        result: {
          liveTradingOn: !!u?.liveTradingEnabledAt,
          staticIpToRegister: registeredStaticIp(u?.liveStaticIp),
          brokers: conns.map((c) => ({
            broker: c.broker,
            loggedInToday: c.status === "CONNECTED" && !!c.tokenExpiresAt && c.tokenExpiresAt.getTime() > now,
            readinessPassedWithin24h: !!c.liveReadyAt && now - c.liveReadyAt.getTime() < 86_400_000,
          })),
          liveStrategies: deps.map((d) => ({ ...d, pendingSignals: ((d.pendingSignals as unknown as unknown[]) ?? []).length })),
          recentLiveOrders: orders,
        },
      };
    }
    case "list_custom_indicators": {
      const rows = await prisma.customIndicator.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { name: true, description: true, def: true } });
      return { result: rows.map((r) => ({ name: r.name, definition: describeCustom(r.def as unknown as CustomIndicatorDef), description: r.description })) };
    }
    case "draft_custom_indicator": {
      const formula = str(a.formula).trim();
      try {
        parseFormula(formula);
      } catch (err) {
        return { result: { error: `${err instanceof FormulaError ? err.message : "Invalid formula."} Fix it and call draft_custom_indicator again.` } };
      }
      const q = new URLSearchParams({ name: str(a.name).slice(0, 60), formula, pane: a.pane === "price" ? "price" : "separate", ...(str(a.description) ? { description: str(a.description).slice(0, 300) } : {}) });
      return { result: { ok: true, link: `/app/indicators?${q}`, note: "Give the user this link: they can preview it on any chart and save it. Once saved, it can be used in strategy rules." } };
    }
    case "list_instruments": {
      // 2,000+ instruments: never dump them all into the conversation — search and return the best 25.
      const q = str(a.query).trim();
      const rows = q
        ? await prisma.instrument.findMany({
            where: { OR: [{ symbol: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
            orderBy: { symbol: "asc" },
            take: 60,
            select: { symbol: true, name: true, sector: true },
          })
        : await prisma.instrument.findMany({ where: { sector: { not: null } }, orderBy: { symbol: "asc" }, take: 60, select: { symbol: true, name: true, sector: true } });
      // Exact and prefix matches first.
      const u = q.toUpperCase();
      const score = (r: { symbol: string; name: string }) => (r.symbol.replace(/\.NS$/, "") === u ? 0 : r.symbol.startsWith(u) ? 1 : r.name.toUpperCase().startsWith(u) ? 2 : 3);
      return { result: rows.sort((x, y) => score(x) - score(y)).slice(0, 25) };
    }
    case "propose_strategy":
      return proposeStrategy(userId, a);
    case "propose_strategy_update":
      return proposeStrategyUpdate(userId, a);
    case "propose_backtest":
    case "propose_forward_test": {
      const strategy = await findStrategy(userId, str(a.strategy));
      if (!strategy) return { result: { error: `No strategy matches "${str(a.strategy)}". Ask the user which strategy they mean.` } };
      if ("ambiguous" in strategy) return ambiguityResult(strategy.ambiguous);
      const ref = { strategyId: strategy.id, strategyName: strategy.name, instrumentSymbol: strategy.instrument.symbol };
      if (name === "propose_forward_test") {
        return { result: { ok: true, note: "A review window is open for the user to confirm. Summarise in one sentence." }, proposal: paperStep(ref, a) };
      }
      const planned = withFollowUps(backtestStep(ref, a), ref, a);
      return { result: { ok: true, steps: planned.steps, note: "A review window is open for the user to confirm. Summarise in one sentence." }, proposal: planned.proposal };
    }
    case "propose_risk_limits": {
      const current = await prisma.riskSettings.findUnique({ where: { userId } });
      const pick = (key: "max_loss_percent" | "max_consecutive_losses", fallback: number | null) =>
        key in a ? (a[key] === null ? null : num(a[key]) ?? fallback) : fallback;
      const draft = {
        killSwitchEnabled: current?.killSwitchEnabled ?? false,
        maxLossPercent: pick("max_loss_percent", current?.maxLossPercent ?? null),
        maxConsecutiveLosses: pick("max_consecutive_losses", current?.maxConsecutiveLosses ?? null),
      };
      return {
        result: { ok: true, current: { maxLossPercent: current?.maxLossPercent ?? null, maxConsecutiveLosses: current?.maxConsecutiveLosses ?? null }, note: "Review window open." },
        proposal: { kind: "risk_limits", status: "pending", draft },
      };
    }
    case "propose_kill_switch":
      return {
        result: { ok: true, note: "Review window open." },
        proposal: { kind: "kill_switch", status: "pending", draft: { enabled: a.enabled === true } },
      };
    case "propose_watchlist_add": {
      const instrument = await findInstrument(str(a.instrument_symbol));
      if (!instrument) return { result: { error: `Unknown instrument "${str(a.instrument_symbol)}". Call list_instruments.` } };
      return {
        result: { ok: true, note: "Review window open." },
        proposal: { kind: "watchlist_add", status: "pending", draft: { instrumentId: instrument.id, instrumentSymbol: instrument.symbol, instrumentName: instrument.name } },
      };
    }
    case "propose_watchlist_remove": {
      const instrument = await findInstrument(str(a.instrument_symbol));
      const item = instrument
        ? await prisma.watchlistItem.findFirst({ where: { userId, instrumentId: instrument.id }, select: { id: true } })
        : null;
      if (!instrument || !item) return { result: { error: `"${str(a.instrument_symbol)}" isn't on the user's watchlist.` } };
      return {
        result: { ok: true, note: "Review window open." },
        proposal: { kind: "watchlist_remove", status: "pending", draft: { watchlistItemId: item.id, instrumentSymbol: instrument.symbol } },
      };
    }
    case "propose_forward_test_action": {
      const ref = str(a.session);
      const select = { id: true, strategyName: true, instrumentSymbol: true, status: true } as const;
      let found = await prisma.paperSession.findFirst({ where: { id: ref, userId }, select });
      if (!found && ref) {
        const candidates = await prisma.paperSession.findMany({
          where: { userId, strategyName: { contains: ref, mode: "insensitive" }, status: { not: "STOPPED" } },
          orderBy: { createdAt: "desc" },
          take: 6,
          select,
        });
        if (candidates.length > 1) {
          return {
            result: {
              ambiguous: true,
              options: candidates.map((c) => `${c.strategyName} on ${c.instrumentSymbol} (${c.status.toLowerCase()}, id ${c.id})`),
              note: "Several forward tests match. Ask the user which one; do not pick one yourself.",
            },
          };
        }
        found = candidates[0] ?? null;
      }
      const action = ["sync", "pause", "resume", "stop"].includes(str(a.action)) ? (str(a.action) as "sync" | "pause" | "resume" | "stop") : null;
      if (!found || !action) return { result: { error: "No matching forward test or action. Call get_my_forward_tests and use its id." } };
      if (found.status === "STOPPED") return { result: { error: "That session is already stopped — stopped sessions can't be changed." } };
      return {
        result: { ok: true, note: "Review window open." },
        proposal: {
          kind: "paper_control",
          status: "pending",
          draft: { sessionId: found.id, strategyName: found.strategyName, instrumentSymbol: found.instrumentSymbol, action },
        },
      };
    }
    case "propose_strategy_archive": {
      const strategy = await findStrategy(userId, str(a.strategy));
      if (!strategy) return { result: { error: `No strategy matches "${str(a.strategy)}". Ask the user which strategy they mean.` } };
      if ("ambiguous" in strategy) return ambiguityResult(strategy.ambiguous);
      return {
        result: { ok: true, note: "Review window open." },
        proposal: { kind: "strategy_archive", status: "pending", draft: { strategyId: strategy.id, strategyName: strategy.name } },
      };
    }
    default:
      return { result: { error: `Unknown tool ${name}` } };
  }
}
