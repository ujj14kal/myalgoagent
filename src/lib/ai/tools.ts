import { prisma } from "@/lib/prisma";
import { INDICATOR_CATALOG } from "@/lib/strategy/indicator-catalog";
import { getPaperSessionRows, summarizePortfolio } from "@/lib/portfolio";
import { compile } from "@/lib/strategy-compile";
import type { MantleTool } from "./mantle";
import { NEW_STRATEGY_ID, toStrategyInput, type AgentProposal, type PlanStep, type RiskUnitName, type SizingModeName } from "./proposals";

// Tools the agent can call. Read tools answer from the user's own data.
// "propose_*" tools never change anything: they validate a ready-to-run
// action and hand it to the chat as a proposal, which the user reviews in a
// modal and confirms (or edits / rejects). Every query is scoped to userId.

const DSL_REFERENCE = [
  "Conditions use the platform's strategy language:",
  "- values: close, open, high, low, volume, numbers, or an indicator call with ALL its settings in brackets, e.g. rsi(14), sma(20), ema(50), vwap(), macdline(12,26,9)",
  "- comparisons: > < >= <= == crossesAbove crossesBelow",
  "- combine with and / or / not and brackets, e.g. (rsi(14) < 30) and (close > sma(200))",
  "- indicators (name(settings)): " + INDICATOR_CATALOG.map((d) => `${d.dslName}(${d.paramLabels.join(", ")})`).join(", "),
].join("\n");

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
  description: "Also start paper trading it in the same review (the user asked to run it forward / paper trade it)",
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

export const AGENT_TOOLS: MantleTool[] = [
  {
    type: "function",
    function: {
      name: "get_my_strategies",
      description: "List the user's strategies (name, instrument, status, direction).",
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
      name: "get_my_paper_sessions",
      description: "The user's paper trading sessions with equity, P&L and status, plus the combined portfolio.",
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
      description: "The user's recent notifications: paper fills (with the rule that caused each), signals, risk events and stopped sessions. Use to explain what happened or give a summary of recent activity.",
      parameters: { type: "object", properties: { days: { type: "number", description: "Look-back in days, 1-30, default 7" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_instruments",
      description: "Instruments available on the platform (NSE symbols).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_strategy",
      description:
        "Prepare a new strategy for the user to review and confirm in a pop-up (nothing is saved until they confirm). Use whenever the user describes a strategy or asks you to build/create one. " +
        DSL_REFERENCE,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          instrument_symbol: { type: "string", description: "NSE symbol like RELIANCE.NS; omit if the user didn't say" },
          direction: { type: "string", enum: ["LONG", "SHORT"] },
          entry: { type: "string", description: "Entry condition in the strategy language" },
          exit: { type: "string", description: "Exit condition in the strategy language" },
          stop_loss: riskLegSchema,
          take_profit: riskLegSchema,
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
          also_paper_trade: paperStepSchema,
        },
        required: ["name", "direction", "entry", "exit"],
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
          also_paper_trade: paperStepSchema,
        },
        required: ["strategy"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_paper_session",
      description: "Prepare a paper trading session (virtual money) for one of the user's strategies, for them to confirm. Defaults: ₹1,00,000, 0.03% brokerage, 0.05% slippage.",
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
          max_loss_percent: { type: ["number", "null"], description: "Max loss per paper session, % of its starting capital" },
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
      name: "propose_paper_session_action",
      description:
        "Prepare syncing (update with the latest end-of-day data), pausing, resuming or stopping one of the user's paper sessions, for them to confirm. Get session ids from get_my_paper_sessions.",
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
  const pt = asObject(a.also_paper_trade);
  if (bt && first.kind !== "backtest") steps.push(backtestStep(ref, bt));
  if (pt) steps.push(paperStep(ref, pt));
  return steps.length === 1 ? { proposal: first, steps: 1 } : { proposal: { kind: "plan", status: "pending", steps }, steps: steps.length };
}

async function proposeStrategy(userId: string, a: Record<string, unknown>): Promise<ToolOutcome> {
  const instrument = str(a.instrument_symbol) ? await findInstrument(str(a.instrument_symbol)) : null;
  if (str(a.instrument_symbol) && !instrument) {
    return { result: { error: `Unknown instrument "${str(a.instrument_symbol)}". Call list_instruments and use an exact symbol, or omit it so the user picks one.` } };
  }
  const sizing = (a.position_sizing ?? {}) as { mode?: unknown; value?: unknown };
  const mode: SizingModeName =
    sizing.mode === "FIXED_QUANTITY" || sizing.mode === "FIXED_CAPITAL" || sizing.mode === "PERCENT_OF_CAPITAL" ? sizing.mode : "FULL_CAPITAL";
  const draft = {
    name: await uniqueStrategyName(userId, str(a.name)),
    instrumentId: instrument?.id ?? null,
    instrumentSymbol: instrument?.symbol ?? null,
    direction: a.direction === "SHORT" ? ("SHORT" as const) : ("LONG" as const),
    entrySource: str(a.entry),
    exitSource: str(a.exit),
    stopLoss: leg(a.stop_loss),
    target: leg(a.take_profit),
    trailingSl: leg(a.trailing_stop),
    positionSizingMode: mode,
    positionSizingValue: mode === "FULL_CAPITAL" ? null : num(sizing.value) ?? null,
  };

  // Same validator as the builder. Instrument isn't needed to check the rules,
  // so a placeholder stands in when the user hasn't picked one yet.
  try {
    await compile(toStrategyInput(draft, draft.instrumentId ?? "pending"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid strategy";
    return { result: { error: `The strategy didn't pass validation: ${msg}. Fix it and call propose_strategy again.` } };
  }

  const planned = withFollowUps(
    { kind: "strategy", status: "pending", draft },
    { strategyId: NEW_STRATEGY_ID, strategyName: draft.name, instrumentSymbol: draft.instrumentSymbol ?? "" },
    a
  );
  return {
    result: {
      ok: true,
      steps: planned.steps,
      note: "A review window is now open for the user. Briefly tell them what you prepared (and the follow-up steps, if any); do not repeat every field. Don't claim anything is done — they confirm it.",
      needsInstrument: !draft.instrumentId,
    },
    proposal: planned.proposal,
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
        select: { id: true, name: true, status: true, direction: true, mode: true, instrument: { select: { symbol: true } } },
      });
      return { result: rows.map((r) => ({ id: r.id, name: r.name, instrument: r.instrument.symbol, status: r.status, direction: r.direction, mode: r.mode })) };
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
    case "get_my_paper_sessions": {
      const rows = await getPaperSessionRows(userId);
      const summary = summarizePortfolio(rows);
      return {
        result: {
          portfolio: summary,
          sessions: rows.slice(0, 15).map((r) => ({
            id: r.session.id, strategy: r.session.strategyName, instrument: r.session.instrumentSymbol, status: r.session.status,
            startingCapital: r.session.startingCapital, equity: Math.round(r.equity), pnlPct: Number(r.pnlPct.toFixed(2)),
            inPosition: r.session.positionQuantity != null, link: `/app/paper-trading/${r.session.id}`,
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
          link: r.paperSessionId ? `/app/paper-trading/${r.paperSessionId}` : null,
        })),
      };
    }
    case "list_instruments": {
      const rows = await prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { symbol: true, name: true, sector: true } });
      return { result: rows };
    }
    case "propose_strategy":
      return proposeStrategy(userId, a);
    case "propose_backtest":
    case "propose_paper_session": {
      const strategy = await findStrategy(userId, str(a.strategy));
      if (!strategy) return { result: { error: `No strategy matches "${str(a.strategy)}". Ask the user which strategy they mean.` } };
      if ("ambiguous" in strategy) return ambiguityResult(strategy.ambiguous);
      const ref = { strategyId: strategy.id, strategyName: strategy.name, instrumentSymbol: strategy.instrument.symbol };
      if (name === "propose_paper_session") {
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
    case "propose_paper_session_action": {
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
              note: "Several paper sessions match. Ask the user which one; do not pick one yourself.",
            },
          };
        }
        found = candidates[0] ?? null;
      }
      const action = ["sync", "pause", "resume", "stop"].includes(str(a.action)) ? (str(a.action) as "sync" | "pause" | "resume" | "stop") : null;
      if (!found || !action) return { result: { error: "No matching paper session or action. Call get_my_paper_sessions and use its id." } };
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
