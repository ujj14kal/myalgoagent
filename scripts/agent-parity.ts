// Checks the agent can build everything the manual builder can, with the real
// tools against a real account (read-only — propose_* tools never write).
//   AWS_PROFILE=myalgoagent-admin npx tsx --env-file=.env.local scripts/agent-parity.ts [userEmail] [--only name]
// Each case passes when the reply carries a proposal whose saved form matches.
import { converse } from "../src/lib/ai/bedrock";
import { AI_MODELS } from "../src/lib/ai/config";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { AGENT_TOOLS, runAgentTool } from "../src/lib/ai/tools";
import { prisma } from "../src/lib/prisma";
import type { AgentProposal } from "../src/lib/ai/proposals";
import { isNeverExitCondition, type ConditionNode } from "../src/lib/strategy/types";

type Case = { name: string; ask: string; expect: (p: AgentProposal | undefined, json: string, text?: string) => string | null };

const strat = (p: AgentProposal | undefined) =>
  p?.kind === "strategy" || p?.kind === "strategy_update" ? p.draft : p?.kind === "plan" ? p.steps.find((s) => s.kind === "strategy")?.draft : undefined;
const need = (cond: boolean, msg: string) => (cond ? null : msg);
const has = (json: string, ...parts: string[]) => parts.filter((x) => !json.includes(x));

const CASES: Case[] = [
  { name: "time window entry/exit", ask: "Create a strategy on INFY: buy at 9:15 am and exit at 9:30 am every day.", expect: (p, j) => need(!!strat(p) && has(j, '"TIME_WINDOW"', '"startMinute":555').length === 0 && j.includes('"startMinute":570'), "expected 09:15 entry window and 09:30 exit window") },
  { name: "time window + indicator", ask: "Build a RELIANCE strategy: between 9:30 and 11:00 buy when RSI(14) crosses above 30, exit when RSI goes above 70.", expect: (p, j) => need(!!strat(p) && has(j, '"TIME_WINDOW"', '"RSI"', '"CROSSES_ABOVE"').length === 0, "time window + RSI cross") },
  { name: "candle pattern", ask: "Make a TCS strategy that goes long on a bullish engulfing candle with a 2% stop-loss and 4% target.", expect: (p, j) => need(!!strat(p) && j.includes("BULLISH_ENGULFING") && strat(p)!.stopLoss.enabled && strat(p)!.target.enabled, "engulfing + SL/TP") },
  { name: "candle pattern no exit", ask: "Create an HDFCBANK strategy: buy on a hammer candle, only a 1.5% trailing stop to exit, no other exit.", expect: (p, j) => need(!!strat(p) && j.includes("HAMMER") && strat(p)!.exitCondition === null && strat(p)!.trailingSl.enabled, "hammer, trailing stop, no rule exit") },
  { name: "chart pattern", ask: "Build a strategy on ITC that buys on a double bottom and sells on a double top.", expect: (p, j) => need(!!strat(p) && j.includes("DOUBLE_BOTTOM") && j.includes("DOUBLE_TOP"), "double bottom/top") },
  { name: "volume pattern", ask: "Create a SBIN strategy: enter when there's a volume spike and close is above SMA 20, exit when close drops below SMA 20.", expect: (p, j) => need(!!strat(p) && j.includes("VOLUME_PATTERN") && j.includes('"SMA"'), "volume pattern + SMA") },
  { name: "other timeframe", ask: "Create an INFY strategy that buys when the 15-minute RSI(14) is below 30 and the daily close is above the 200 EMA; exit when 15-minute RSI is above 60.", expect: (p, j) => need(!!strat(p) && j.includes('"timeframe":"15m"') && j.includes('"EMA"'), "15m RSI + daily EMA") },
  { name: "other instrument", ask: "Build a strategy on INFY that buys when TCS's RSI(14) crosses above 50 and sells when it crosses below 50.", expect: (p, j) => need(!!strat(p) && j.includes('"instrumentSymbol":"TCS.NS"'), "reads TCS from an INFY strategy") },
  { name: "OR / NOT", ask: "Create a WIPRO strategy: buy when (RSI 14 < 30 or a hammer candle) and not close below SMA 200. Exit when RSI 14 > 70.", expect: (p, j) => need(!!strat(p) && j.includes('"op":"OR"') && (j.includes('"kind":"not"') || j.includes('"GTE"')), "OR group and NOT (or its equivalent)") },
  { name: "short + ATR + sizing + pyramiding", ask: "Short strategy on RELIANCE: sell when MACD line crosses below the signal line, cover when it crosses back above. Stop-loss 2x ATR, 10% of capital per trade, allow up to 3 entries.", expect: (p) => { const d = strat(p); return need(!!d && d.direction === "SHORT" && d.stopLoss.unit === "ATR_MULTIPLE" && d.positionSizingMode === "PERCENT_OF_CAPITAL" && d.maxPyramidEntries === 3, "short, ATR SL, % sizing, 3 entries"); } },
  { name: "points + fixed qty", ask: "INFY long when close crosses above EMA 50, exit when it crosses below; stop 20 points, target 40 points, 25 shares each time.", expect: (p) => { const d = strat(p); return need(!!d && d.stopLoss.unit === "POINTS" && d.target.unit === "POINTS" && d.positionSizingMode === "FIXED_QUANTITY" && d.positionSizingValue === 25, "points + 25 shares"); } },
  { name: "Bollinger / Stochastic", ask: "Create a TCS strategy: buy when close is below the lower Bollinger band (20, 2) and Stochastic %K is below 20; exit when close is above the middle band.", expect: (p, j) => need(!!strat(p) && j.includes("BB") && j.includes("STOCH"), "Bollinger + stochastic") },
  { name: "invalid ask gets fixed, not denied", ask: "Create an INFY strategy: buy when RSI(14) crosses above the close price, sell when RSI crosses below 50.", expect: (p, j, text) => need(!!strat(p) || /\?/.test(text ?? ""), "should produce a corrected strategy or ask how to fix it — got nothing") },
  { name: "chain with time rule", ask: "Build a RELIANCE strategy that buys between 9:15 and 9:20 and exits between 15:15 and 15:30, then backtest it for 1 year.", expect: (p, j) => need(p?.kind === "plan" && j.includes('"TIME_WINDOW"'), "plan: create + backtest") },
];

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const email = args.find((a) => a.includes("@"));
  const user = await prisma.user.findFirst({ where: email ? { email } : { strategies: { some: {} } }, select: { id: true, agentName: true } });
  if (!user) throw new Error("No user found");
  const strategies = await prisma.strategy.findMany({ where: { userId: user.id, status: { notIn: ["DELETED", "ARCHIVED"] } }, include: { instrument: true }, take: 20 });
  const system = buildSystemPrompt(user.agentName ?? "Mr. Agent", {
    strategies: strategies.map((s) => ({ name: s.name, instrument: s.instrument.symbol, status: s.status })),
    activeSessions: [],
  });

  // A strategy that's valid as saved (has an exit rule or a risk leg), so an edit can pass validation.
  const editable = strategies.find((s) => s.mode !== "WEBHOOK" && (s.stopLossEnabled || s.targetEnabled || s.trailingSlEnabled || !isNeverExitCondition(s.exitCondition as unknown as ConditionNode)));
  if (editable) {
    const n = editable.name;
    CASES.push(
      { name: "edit: risk + sizing", ask: `Change my "${n}" strategy: add a 3% stop-loss and use 20% of capital per trade.`, expect: (p) => need(p?.kind === "strategy_update" && p.draft.stopLoss.enabled && p.draft.stopLoss.value === 3 && p.draft.positionSizingMode === "PERCENT_OF_CAPITAL", "update with 3% SL, 20% sizing") },
      { name: "edit: add time rule", ask: `Update my "${n}" strategy so it only enters between 9:15 and 10:30 am, keep the rest of the entry rule.`, expect: (p, j) => need(p?.kind === "strategy_update" && j.includes('"TIME_WINDOW"'), "update adds time window") },
    );
  }

  let pass = 0;
  const cases = CASES.filter((c) => !only || c.name.includes(only));
  for (const c of cases) {
    const reply = await converse({ model: AI_MODELS.main, system, turns: [{ role: "user", text: c.ask }], tools: AGENT_TOOLS, runTool: async (n, a) => {
      const out = await runAgentTool(user.id, n, a);
      if (process.env.VERBOSE) console.log(`   · ${n} ${a.slice(0, 500)}\n     → ${JSON.stringify(out.result).slice(0, 400)}`);
      return out;
    } });
    const json = JSON.stringify(reply.proposal ?? {});
    const problem = c.expect(reply.proposal, json, reply.text);
    if (!problem) pass++;
    console.log(`${problem ? "✗" : "✓"} ${c.name}${problem ? ` — ${problem}` : ""}`);
    if (problem) console.log(`   guardrailHit=${reply.guardrailHit}\n   reply: ${reply.text.replace(/\s+/g, " ").slice(0, 300)}\n   proposal: ${json.slice(0, 400)}`);
  }
  console.log(`\n${pass}/${cases.length} passed`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
