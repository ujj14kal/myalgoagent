// Checks the agent can build everything the manual builder can, with the real
// tools against a real account (read-only — propose_* tools never write).
//   AWS_PROFILE=myalgoagent-admin npx tsx --env-file=.env.local scripts/agent-parity.ts [userEmail] [--only name]
// Each case passes when the reply carries a proposal whose saved form matches.
import { converse } from "../src/lib/ai/bedrock";
import { AI_MODELS } from "../src/lib/ai/config";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { AGENT_TOOLS, runAgentTool } from "../src/lib/ai/tools";
import { prisma } from "../src/lib/prisma";
import { forModel } from "../src/lib/ai/redact";
import { groupReply } from "../src/lib/ai/reply-format";
import type { AgentProposal } from "../src/lib/ai/proposals";
import { isNeverExitCondition, type ConditionNode } from "../src/lib/strategy/types";

type Case = { name: string; ask: string; expect: (p: AgentProposal | undefined, json: string, text?: string) => string | null };

const strat = (p: AgentProposal | undefined) =>
  p?.kind === "strategy" || p?.kind === "strategy_update" ? p.draft : p?.kind === "plan" ? p.steps.find((s) => s.kind === "strategy")?.draft : undefined;
const need = (cond: boolean, msg: string) => (cond ? null : msg);
const has = (json: string, ...parts: string[]) => parts.filter((x) => !json.includes(x));

const CASES: Case[] = [
  { name: "time window entry/exit", ask: "Create a strategy on INFY: buy at 9:15 am and exit at 9:30 am every day.", expect: (p, j) => need(!!strat(p) && has(j, '"TIME_WINDOW"', '"startMinute":555').length === 0 && j.includes('"startMinute":570') && strat(p)!.timeframe !== undefined && strat(p)!.timeframe !== "1d", "expected 09:15 entry, 09:30 exit on an intraday timeframe") },
  { name: "time window + indicator", ask: "Build a RELIANCE strategy: between 9:30 and 11:00 buy when RSI(14) crosses above 30, exit when RSI goes above 70.", expect: (p, j) => need(!!strat(p) && has(j, '"TIME_WINDOW"', '"RSI"', '"CROSSES_ABOVE"').length === 0, "time window + RSI cross") },
  { name: "candle pattern", ask: "Make a TCS strategy that goes long on a bullish engulfing candle with a 2% stop-loss and 4% target.", expect: (p, j) => need(!!strat(p) && j.includes("BULLISH_ENGULFING") && strat(p)!.stopLoss.enabled && strat(p)!.target.enabled, "engulfing + SL/TP") },
  { name: "candle pattern no exit", ask: "Create an HDFCBANK strategy: buy on a hammer candle, only a 1.5% trailing stop to exit, no other exit.", expect: (p, j) => need(!!strat(p) && j.includes("HAMMER") && strat(p)!.exitCondition === null && strat(p)!.trailingSl.enabled, "hammer, trailing stop, no rule exit") },
  { name: "chart pattern", ask: "Build a strategy on ITC that buys on a double bottom and sells on a double top.", expect: (p, j) => need(!!strat(p) && j.includes("DOUBLE_BOTTOM") && j.includes("DOUBLE_TOP"), "double bottom/top") },
  { name: "volume pattern", ask: "Create a SBIN strategy: enter when there's a volume spike and close is above SMA 20, exit when close drops below SMA 20.", expect: (p, j) => need(!!strat(p) && j.includes("VOLUME_PATTERN") && j.includes('"SMA"'), "volume pattern + SMA") },
  { name: "other timeframe", ask: "Create an INFY strategy that buys when the 15-minute RSI(14) is below 30 and the daily close is above the 200 EMA; exit when 15-minute RSI is above 60.", expect: (p, j) => need(!!strat(p) && j.includes('"timeframe":"15m"') && j.includes('"EMA"'), "15m RSI + daily EMA") },
  { name: "other instrument", ask: "Build a strategy on INFY that buys when TCS's RSI(14) crosses above 50 and sells when it crosses below 50.", expect: (p, j) => need(!!strat(p) && j.includes('"instrumentSymbol":"TCS.NS"'), "reads TCS from an INFY strategy") },
  { name: "OR / NOT", ask: "Create a WIPRO strategy: buy when (RSI 14 < 30 or a hammer candle) and not close below SMA 200. Exit when RSI 14 > 70.", expect: (p, j) => need(!!strat(p) && j.includes('"op":"OR"') && (j.includes('"kind":"not"') || j.includes('"GTE"')), "OR group and NOT (or its equivalent)") },
  { name: "short + ATR + sizing + pyramiding", ask: "Short strategy on RELIANCE: sell when MACD line crosses below the signal line, cover when it crosses back above. Stop-loss 2x ATR, 10% of capital per trade, allow up to 3 entries.", expect: (p, _j, text) => { const d = strat(p); // Shorts can't be held overnight (delivery), so an intraday short — or a question about it — is right.
      return need((!!d && d.direction === "SHORT" && d.stopLoss.unit === "ATR_MULTIPLE" && d.positionSizingMode === "PERCENT_OF_CAPITAL" && d.maxPyramidEntries === 3 && d.productType === "INTRADAY" && d.timeframe !== "1d") || (!d && /intraday|overnight/i.test(text ?? "")), "intraday short with ATR SL, % sizing, 3 entries — or explains shorts need intraday"); } },
  { name: "points + fixed qty", ask: "INFY long when close crosses above EMA 50, exit when it crosses below; stop 20 points, target 40 points, 25 shares each time.", expect: (p) => { const d = strat(p); return need(!!d && d.stopLoss.unit === "POINTS" && d.target.unit === "POINTS" && d.positionSizingMode === "FIXED_QUANTITY" && d.positionSizingValue === 25, "points + 25 shares"); } },
  { name: "Bollinger / Stochastic", ask: "Create a TCS strategy: buy when close is below the lower Bollinger band (20, 2) and Stochastic %K is below 20; exit when close is above the middle band.", expect: (p, j) => need(!!strat(p) && j.includes("BB") && j.includes("STOCH"), "Bollinger + stochastic") },
  { name: "invalid ask gets fixed, not denied", ask: "Create an INFY strategy: buy when RSI(14) crosses above the close price, sell when RSI crosses below 50.", expect: (p, j, text) => need(!!strat(p) || /\?|would you like|which (one|option)/i.test(text ?? ""), "should produce a corrected strategy or ask how to fix it — got nothing") },
  { name: "candle pattern at support", ask: "Create an INFY strategy: buy on a hammer candle but only when it forms at a support level; 2% stop-loss and 5% target.", expect: (p, j) => need(!!strat(p) && j.includes("HAMMER") && j.includes('"atLevel":"SUPPORT"'), "hammer with atLevel SUPPORT") },
  { name: "resistance breakout", ask: "Build a TCS strategy that buys when the close breaks above resistance and exits when it falls below support.", expect: (p, j) => need(!!strat(p) && j.includes('"RESISTANCE"') && j.includes('"SUPPORT"'), "uses RESISTANCE and SUPPORT indicators") },
  { name: "intraday session rules", ask: "Make a 15-minute INFY strategy: buy when RSI(14) crosses above 30, no new entries after 2:30 pm, square off at 3:15 pm, 1% stop-loss.", expect: (p) => { const d = strat(p); return need(!!d && d.timeframe === "15m" && d.noEntryAfterMinute === 870 && d.squareOffMinute === 915, "15m, no entries after 14:30, square-off 15:15"); } },
  { name: "limit order entry", ask: "INFY daily strategy: buy when RSI(14) crosses above 30 with a limit order 0.5% below the signal price, exit when RSI goes above 70.", expect: (p) => { const d = strat(p); return need(!!d && d.orderType === "LIMIT" && d.limitMode === "PERCENT" && d.limitValue === 0.5, "limit 0.5% entry"); } },
  { name: "fixed price limit", ask: "Create a TCS strategy that buys with a limit order at ₹3,050 when close crosses above SMA 20, and sells when it crosses below.", expect: (p) => { const d = strat(p); return need(!!d && d.orderType === "LIMIT" && d.limitMode === "PRICE" && d.limitValue === 3050, "fixed ₹3,050 limit"); } },
  { name: "chain with time rule", ask: "Build a RELIANCE strategy that buys between 9:15 and 9:20 and exits between 15:15 and 15:30, then backtest it for 1 year.", expect: (p, j) => need(p?.kind === "plan" && j.includes('"TIME_WINDOW"'), "plan: create + backtest") },
  // Staged targets (Target 1-3): sells a share at each target and locks profit on the rest.
  { name: "staged targets: three targets, fixed lock", ask: "RELIANCE long when RSI(14) crosses above 30, exit when RSI goes above 70. Take profit in parts: sell 25% at +5%, 25% at +10% and 25% at +15%, locking profit at each target, with a 2% stop-loss.", expect: (p) => { const d = strat(p); return need(!!d && d.targets?.length === 3 && d.targets.every((t) => t.exitPercent === 25 && t.lock.mode === "FIXED") && d.targets[0].value === 5 && d.targets[2].value === 15 && !d.target.enabled, "three 25% targets at 5/10/15%, fixed lock, no single take-profit"); } },
  { name: "staged targets: margin lock", ask: "INFY long when close crosses above EMA 50, exit when it crosses below. Sell half at +4% and the rest at +8%; after the first target lock the profit but give the price a 1% margin to pull back.", expect: (p) => { const d = strat(p); return need(!!d && d.targets?.length === 2 && d.targets[0].exitPercent === 50 && d.targets[0].lock.mode === "MARGIN", "two targets, first with a margin lock"); } },
  { name: "staged targets: not both", ask: "TCS long on a hammer candle: take-profit 5% and also targets at 3% and 6%.", expect: (p, _j, t = "") => need(!p || (!strat(p)?.target.enabled || !strat(p)?.targets?.length), "must not save both a single take-profit and staged targets") },
  // Swing / long-term: multi-level entry plan, holding limit, daily delivery long-only.
  { name: "swing: quarter now, quarter at each 3% dip", ask: "Swing strategy on HDFCBANK: buy when the daily RSI(14) drops below 35 and exit when it goes above 60. Build the position in four parts: a quarter on the signal and a quarter more at each further 3% dip (3%, 6% and 9% below the first buy). Close it after 60 days at most.", expect: (p) => { const d = strat(p); return need(!!d && d.style === "SWING" && d.timeframe === "1d" && d.productType === "DELIVERY" && d.entryPlan?.firstPercent === 25 && d.entryPlan.levels.length === 3 && d.entryPlan.levels.every((l) => l.trigger === "PULLBACK" && l.allocationPercent === 25) && d.entryPlan.maxHoldDays === 60, "swing, daily delivery, 25% + three 25% pullback levels, 60-day limit"); } },
  { name: "positional: entry plan with staged targets", ask: "Long-term positional strategy on INFY: buy when close crosses above the 200-day SMA. Buy half on the signal and half if it dips 5%. Sell a quarter at +10%, a quarter at +20% and a quarter at +30%, locking profit at each, and keep the rest.", expect: (p) => { const d = strat(p); return need(!!d && d.style === "POSITIONAL" && d.entryPlan?.levels.length === 1 && d.entryPlan.firstPercent === 50 && d.targets?.length === 3, "positional, 50% + one 50% level, three targets"); } },
  { name: "swing: buy more when a rule holds", ask: "Swing strategy on TCS: buy when close crosses above the 50-day SMA, exit when it crosses below. Build it in two parts: half on the signal, and the other half later once the daily RSI(14) is back above 55. Risk 1% of my capital per trade with a 6% stop-loss.", expect: (p) => { const d = strat(p); return need(!!d && d.style === "SWING" && d.entryPlan?.levels.length === 1 && d.entryPlan.levels[0].trigger === "SIGNAL" && d.positionSizingMode === "RISK_PERCENT" && d.positionSizingValue === 1 && d.stopLoss.enabled, "swing, one rule-triggered level, risk 1% sizing, stop-loss on"); } },
  { name: "swing short is refused or fixed", ask: "Swing strategy shorting RELIANCE on the daily chart: sell when RSI(14) is above 70, hold for weeks.", expect: (p, _j, t = "") => need(!p || strat(p)?.direction === "LONG" || /long only|can.?t (hold|short)|overnight|delivery/i.test(t), "must not save a short swing strategy") },
  // Weekly strategies
  { name: "weekly swing strategy", ask: "Positional strategy on HDFCBANK on weekly candles: buy when the weekly close crosses above the 30-week SMA, exit when it crosses below. 10% stop-loss.", expect: (p) => { const d = strat(p); return need(!!d && d.timeframe === "1wk" && d.productType === "DELIVERY" && d.direction === "LONG", "weekly candles, delivery, long"); } },
  // Workspaces: strategies and rules connected into one plan.
  { name: "workspace: rules of your own, confirmation", ask: "Create a workspace called Dip with trend on INFY (daily): enter when RSI(14) crosses below 30, but only if the close was above the 50-day SMA at some point in the 3 candles before. Stop-loss 5%.", expect: (p) => { const w = p?.kind === "workspace" ? p.draft : null; return need(!!w && w.definition.entry?.type === "group" && w.definition.entry.connection === "CONFIRMATION" && w.definition.stopLoss.enabled && w.definition.members.length === 0, "a confirmation group of two rules of its own, with a stop-loss"); } },
  { name: "workspace: veto", ask: "Make a workspace on RELIANCE that buys when RSI(14) crosses above 40 unless the close is below the 200-day SMA. Daily candles, 4% stop-loss, sell when RSI goes above 70.", expect: (p) => { const w = p?.kind === "workspace" ? p.draft : null; return need(!!w && w.definition.entry?.type === "group" && w.definition.entry.connection === "VETO" && !!w.definition.exit, "a veto group and an exit rule"); } },
  { name: "workspace: sequence with a window", ask: "In a new workspace on TCS (daily), enter when the close crosses above the 20-day SMA and then, within 5 candles, RSI(14) rises above 55. 5% stop, publish it too.", expect: (p) => { const w = p?.kind === "workspace" ? p.draft : null; return need(!!w && w.definition.entry?.type === "group" && w.definition.entry.connection === "SEQUENCE" && (w.definition.entry.bars ?? 5) === 5 && w.publish, "a sequence of two rules within 5 candles, to be published"); } },
  // Broker connections — guided by get_broker_connection_guide, never collecting secrets in chat.
  { name: "broker: which one?", ask: "I want to connect my broker", expect: (p, _j, t = "") => need(!p && /\?/.test(t) && /dhan/i.test(t) && /zerodha/i.test(t), "asks which broker, naming the supported ones") },
  { name: "broker: dhan guide", ask: "How do I connect my Dhan account?", expect: (p, _j, t = "") => need(!p && t.includes("myalgoagent.com/api/brokers/dhan/callback") && /client\s?id/i.test(t) && t.includes("/app/broker-connections?broker=dhan"), "Dhan steps with the exact Redirect URL, Client ID and a button to the page") },
  { name: "broker: zerodha guide", ask: "connect zerodha kite", expect: (p, _j, t = "") => need(!p && t.includes("/api/brokers/zerodha/callback") && /developers\.kite\.trade/i.test(t), "Zerodha steps with Kite developer site and Redirect URL") },
  { name: "broker: secret pasted in chat", ask: "Here is my Upstox API secret: q7Rk29xLm4Pz81Vt, please connect it for me", expect: (p, _j, t = "") => need(!p && !t.includes("q7Rk29xLm4Pz81Vt") && /regenerat/i.test(t) && /broker connections/i.test(t), "refuses the secret, doesn't repeat it, says regenerate and use the page") },
  { name: "broker: coming next", ask: "Can I connect my Kotak Neo account?", expect: (p, _j, t = "") => need(!p && /coming|not (yet|available|live)|isn.t live|soon/i.test(t), "says Kotak Neo is coming next") },
  { name: "broker: groww approval", ask: "How do I connect Groww?", expect: (p, _j, t = "") => need(!p && /approv/i.test(t) && !t.includes("/api/brokers/groww/callback"), "explains Groww's daily key approval and gives no Redirect URL") },
  // Custom indicator classes: the draft link carries the right kind (decoded from the reply).
  { name: "custom: band", ask: "Make me a custom indicator: a band around the 20-day SMA, two standard deviations wide.", expect: (p, _j, t = "") => { const d = decodeURIComponent(t.replace(/\+/g, " ")); return need(/\[\[go:\/app\/indicators\?[^\]]*kind=band/.test(d) && /width=[^&|\]]*stdev/.test(d), "a band draft link (sma ± stdev)"); } },
  { name: "custom: zone", ask: "Save a demand zone for RELIANCE between 1180 and 1210 as a custom indicator.", expect: (p, _j, t = "") => { const d = decodeURIComponent(t.replace(/\+/g, " ")); return need(/\[\[go:\/app\/indicators\?[^\]]*kind=zone[^\]]*upper=1210[^\]]*lower=1180/.test(d) && /draft/i.test(t), "a zone draft button 1180–1210, called a draft"); } },
  { name: "custom: signal markers", ask: "I want a custom indicator that puts a marker on the chart whenever the 20 EMA crosses above the 50 EMA.", expect: (p, _j, t = "") => { const d = decodeURIComponent(t.replace(/\+/g, " ")); return need(/\[\[go:\/app\/indicators\?[^\]]*kind=signal[ +]markers/.test(d) && /formula=crossover/.test(d), "a signal-markers draft link with crossover"); } },
  { name: "custom: channel", ask: "Create a custom channel indicator: upper line is the highest high of 20 bars and lower line is the lowest low of 20 bars.", expect: (p, _j, t = "") => { const d = decodeURIComponent(t.replace(/\+/g, " ")); return need(/\[\[go:\/app\/indicators\?[^\]]*kind=channel/.test(d) && /upper=highest\(high, ?20\)/.test(d) && /lower=lowest\(low, ?20\)/.test(d), "a channel draft link"); } },
  // Options Lab contract picker: one contract's Greeks, with where they came from.
  { name: "options: one contract's Greeks", ask: "What are the delta, theta and rho of the NIFTY at-the-money call for the nearest expiry? Where do those numbers come from?", expect: (p, _j, t = "") => need(!p && /delta/i.test(t) && /theta/i.test(t) && /rho/i.test(t) && /(broker|feed|calculated|estimat|provided)/i.test(t), "gives delta/theta/rho and says where they came from") },
  // Comparisons come back as real tables the chat can draw.
  { name: "table: brokers compared", ask: "Compare the brokers I can connect — cost and how often I need to log in.", expect: (p, _j, t = "") => { const tb = groupReply(t).find((g) => g.kind === "table"); return need(!p && tb?.kind === "table" && tb.rows.length >= 5 && tb.header.length >= 3 && /free/i.test(t) && !/₹\s?\d+\s*(per|\/)\s*(trade|order)|%\s*of turnover/i.test(t), "a table per live broker with the real (free) API cost — no invented brokerage fees"); } },
  { name: "table: indicators compared", ask: "What's the difference between RSI, MACD and Bollinger Bands? Compare what each measures, typical settings and a common signal.", expect: (p, _j, t = "") => { const tb = groupReply(t).find((g) => g.kind === "table"); return need(!p && tb?.kind === "table" && tb.rows.length >= 3, "a comparison table with a row per indicator"); } },
];

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const email = args.find((a) => a.includes("@"));
  // (--voice adds transcript-style cases and the voice system prompt)
  const user = await prisma.user.findFirst({ where: email ? { email } : { strategies: { some: {} } }, select: { id: true, agentName: true } });
  if (!user) throw new Error("No user found");
  const strategies = await prisma.strategy.findMany({ where: { userId: user.id, status: { notIn: ["DELETED", "ARCHIVED"] } }, include: { instrument: true }, take: 20 });
  const voice = args.includes("--voice");
  const system = buildSystemPrompt(
    user.agentName ?? "Mr. Agent",
    {
      strategies: strategies.map((s) => ({ name: s.name, instrument: s.instrument.symbol, status: s.status })),
      activeSessions: [],
    },
    { voice }
  );
  if (voice) {
    // Real Transcribe output from scripts/voice-roundtrip.ts — mis-heard words included.
    CASES.push(
      { name: "voice: misheard stock", ask: "Create a strategy on enforces that buys at 9:15 and exits at 9:30.", expect: (p, j) => need(!!strat(p) && j.includes("INFY") && j.includes('"TIME_WINDOW"'), "maps 'enforces' to INFY with time windows") },
      { name: "voice: misheard indicator", ask: "By HDFC Bank when RSI crosses above 30 and MECD is positive, exit when RSI goes above 70.", expect: (p, j) => need(!!strat(p) && j.includes("HDFCBANK") && j.includes("MACD"), "maps MECD to MACD") },
    );
  }

  // A strategy that's valid as saved (has an exit rule or a risk leg), so an edit can pass validation.
  const editable = strategies.find((s) => s.mode !== "WEBHOOK" && (s.stopLossEnabled || s.targetEnabled || s.trailingSlEnabled || !isNeverExitCondition(s.exitCondition as unknown as ConditionNode)));
  if (editable) {
    const n = editable.name;
    CASES.push(
      { name: "edit: risk + sizing", ask: `Change my "${n}" strategy: add a 3% stop-loss and use 20% of capital per trade.`, expect: (p) => need(p?.kind === "strategy_update" && p.draft.stopLoss.enabled && p.draft.stopLoss.value === 3 && p.draft.positionSizingMode === "PERCENT_OF_CAPITAL", "update with 3% SL, 20% sizing") },
      { name: "edit: add time rule", ask: `Update my "${n}" strategy so it only enters between 9:15 and 10:30 am, keep the rest of the entry rule.`, expect: (p, j) => need(p?.kind === "strategy_update" && j.includes('"TIME_WINDOW"'), "update adds time window") },
    );
  }

  // A saved zone/channel/band, if the account has one, so a rule reading one of its parts can be checked.
  const multi = (await prisma.customIndicator.findMany({ where: { userId: user.id }, select: { name: true, def: true } })).find((c) => ["zone", "channel", "band"].includes((c.def as { type?: string }).type ?? ""));
  if (multi) {
    CASES.push({ name: "custom: rule reads a zone part", ask: `Create a RELIANCE daily strategy that buys when the close crosses above the lower line of my "${multi.name}" custom indicator and exits when the close is above its upper line.`, expect: (p, j) => need(!!strat(p) && j.includes('"part":"lower"') && j.includes('"part":"upper"'), "rules read the lower and upper parts") });
  }

  let pass = 0;
  const cases = CASES.filter((c) => !only || c.name.includes(only));
  for (const c of cases) {
    const reply = await converse({ model: AI_MODELS.main, system, turns: [{ role: "user", text: forModel(c.ask) }], tools: AGENT_TOOLS, runTool: async (n, a) => {
      const out = await runAgentTool(user.id, n, a);
      if (process.env.VERBOSE) console.log(`   · ${n} ${a.slice(0, 500)}\n     → ${JSON.stringify(out.result).slice(0, 400)}`);
      return out;
    } });
    const json = JSON.stringify(reply.proposal ?? {});
    const problem = c.expect(reply.proposal, json, reply.text);
    if (!problem) pass++;
    console.log(`${problem ? "✗" : "✓"} ${c.name}${problem ? ` — ${problem}` : ""}`);
    if (problem) console.log(`   guardrailHit=${reply.guardrailHit}\n   reply: ${reply.text.replace(/\s+/g, " ").slice(0, 1500)}\n   proposal: ${json.slice(0, 400)}`);
  }
  console.log(`\n${pass}/${cases.length} passed`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
