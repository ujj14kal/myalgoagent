import "server-only";
import { prisma } from "@/lib/prisma";
import type { MantleTool } from "./mantle";
import type { AgentProposal } from "./proposals";
import { toConditionNode, fillCustomRefs } from "./conditions";
import { riskOptionsFrom, riskOptionsSchema } from "./risk-options-arg";
import { targetsFrom } from "./targets-arg";
import { entryPlanFrom } from "./entry-plan-arg";
import { conditionToText } from "@/lib/strategy/format";
import type { ConditionNode } from "@/lib/strategy/types";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";
import { CONNECTIONS, type Connection } from "@/lib/workspace/types";
import { blockProblems, conceptProblems, describeConcept } from "@/lib/system/compile";
import { conceptBlockIds, emptySystem, parseBlockDefinition, parseConceptClass, parseConceptDefinition, parseSystemDefinition, SYSTEM_LIMITS } from "@/lib/system/definition";
import { checkSystem } from "@/lib/system/store";
import { conceptLogicFrom } from "./concept-arg";
import { CONFLICT_RULES, TIMEFRAME_ROLES, type BlockDefinition, type ConceptNode, type ConflictRule, type OppositeAction, type TimeframeRole, type TradingSystemDefinition } from "@/lib/system/types";

// The agent's tools for the workspace's three layers. Each layer is proposed on its own, matching the builders:
//   propose_block   — one market component (a rule); no instrument, side, size or exits.
//   propose_concept — blocks combined into a bullish/bearish setup (can create the blocks it needs in the same review).
//   propose_trading_system — concepts plus every trading decision; optionally publishes a version.
// Nothing is saved until the user confirms the review.

type Outcome = { result: unknown; proposal?: AgentProposal };
export interface SystemToolHelpers {
  findInstrument: (symbol: string) => Promise<{ id: string; symbol: string } | null>;
  leg: (v: unknown) => { enabled: boolean; unit: "PERCENT" | "POINTS" | "ATR_MULTIPLE" | "R_MULTIPLE"; value: number };
  sizingFrom: (v: unknown, fallback?: { mode: TradingSystemDefinition["positionSizingMode"]; value: number | null }) => { mode: TradingSystemDefinition["positionSizingMode"]; value: number | null };
  clockArg: (v: unknown) => number | null | undefined;
  orderArgs: (a: Record<string, unknown>) => { productType?: string; orderType?: string; limitMode?: string | null; limitValue?: number | null };
  timeframeArg: (v: unknown) => string | undefined;
  readableIssues: (err: unknown) => string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (c: ConditionNode) => {
  try {
    return conditionToText(c);
  } catch {
    return "";
  }
};
const NOTE = "A review window is now open for the user. Briefly say what you prepared in plain words; don't repeat every field. Don't claim anything is saved — they confirm it.";

async function withCustom(userId: string, c: ConditionNode): Promise<ConditionNode> {
  if (!JSON.stringify(c).includes('"custom"')) return c;
  const rows = await prisma.customIndicator.findMany({ where: { userId }, select: { name: true, def: true } });
  return fillCustomRefs(c, new Map(rows.map((r) => [r.name, r.def as unknown as CustomIndicatorDef])));
}

async function findByName<T extends { id: string; name: string }>(ref: string, byId: (id: string) => Promise<T | null>, byName: (n: string) => Promise<T | null>, contains: (n: string) => Promise<T[]>): Promise<T | { ambiguous: string[] } | null> {
  const r = ref.trim();
  if (!r) return null;
  const exact = (await byId(r)) ?? (await byName(r.toLowerCase()));
  if (exact) return exact;
  const many = await contains(r);
  if (many.length === 1) return many[0];
  if (many.length > 1) return { ambiguous: many.slice(0, 5).map((m) => m.name) };
  return null;
}

const findBlock = (userId: string, ref: string) =>
  findByName(
    ref,
    (id) => prisma.block.findFirst({ where: { id, userId } }),
    (n) => prisma.block.findFirst({ where: { userId, nameNormalized: n } }),
    (n) => prisma.block.findMany({ where: { userId, name: { contains: n, mode: "insensitive" } }, take: 6 }),
  );
const findConcept = (userId: string, ref: string) =>
  findByName(
    ref,
    (id) => prisma.concept.findFirst({ where: { id, userId } }),
    (n) => prisma.concept.findFirst({ where: { userId, nameNormalized: n } }),
    (n) => prisma.concept.findMany({ where: { userId, name: { contains: n, mode: "insensitive" } }, take: 6 }),
  );
const findSystem = (userId: string, ref: string) =>
  findByName(
    ref,
    (id) => prisma.workspace.findFirst({ where: { id, userId } }),
    (n) => prisma.workspace.findFirst({ where: { userId, nameNormalized: n } }),
    (n) => prisma.workspace.findMany({ where: { userId, name: { contains: n, mode: "insensitive" }, status: { not: "ARCHIVED" } }, take: 6 }),
  );

// ---------- schemas ----------

const conceptNode =
  'A node: {"block":"<block name>","optional":true|false,"timeframe":"primary"|"confirmation"|"higher"} (optional blocks don\'t decide validity, they raise confidence; timeframe is the system\'s role, default primary), or {"connection":"AND"|"OR"|"SEQUENCE"|"CONFIRMATION"|"VETO"|"DEPENDENCY","bars":<candles>,"children":[<nodes>]}. A bare list means AND.';

export function systemTools(riskLegSchema: object, targetsSchema: object, entryPlanSchema: object): MantleTool[] {
  return [
    {
      type: "function",
      function: {
        name: "get_my_workspace",
        description: "List the user's workspace: blocks (each rule in words), concepts (side and setup in words) and trading systems (instrument, timeframes, concepts, status, versions). Call before changing or reusing any of them.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_block",
        description:
          "Prepare a BLOCK — one reusable market component, e.g. My BOS, My FVG, an order-block retest, a liquidity sweep, a horizontal level, a support/resistance zone, a session filter, a volume spike, a moving-average filter — for the user to review. Use this ONLY when the user asks for a single component on its own; for a setup made of several components use propose_concept with new_blocks. A block is ONLY a rule: never put an instrument, buy/sell, size, stop, target or anything about trading in it. Pass `block` (its name) to change an existing one.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            block: { type: "string", description: "Name or id of an existing block to change" },
            description: { type: "string" },
            condition: { description: "The rule, exactly as in CONDITIONS (smart-money components use the smc form)." },
          },
          required: ["condition"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_concept",
        description:
          "Prepare a CONCEPT — blocks combined into ONE setup, classified bullish or bearish — for the user to review. WHEN THE USER DESCRIBES A SETUP MADE OF SEVERAL COMPONENTS (e.g. sweep → BOS → FVG → retest), call THIS tool ONCE with every component the user doesn't have yet in new_blocks — never propose the blocks one by one with propose_block (only one review opens at a time, so the concept would be lost). It only says \"setup valid\"; it never decides instruments, sizes, exits or what to do in a position (that is the trading system). Reference the user's blocks by name; blocks that don't exist yet go in new_blocks (created in the same review). Connections: AND = all on the same candle; SEQUENCE = in the listed order, each within `bars` candles of the next; CONFIRMATION = the first child confirmed by the others within `bars`; VETO = the first child unless any other (a filter); DEPENDENCY = only after the first held for `bars` candles; OR = any. Example \"Liquidity Sweep → BOS → FVG → FVG retest within 10 candles, HTF trend optional\": {\"connection\":\"SEQUENCE\",\"bars\":10,\"children\":[{\"block\":\"My liquidity sweep\"},{\"block\":\"My BOS\"},{\"block\":\"My FVG\"},{\"block\":\"My FVG retest\"},{\"block\":\"HTF trend\",\"optional\":true,\"timeframe\":\"higher\"}]}.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            concept: { type: "string", description: "Name or id of an existing concept to change" },
            description: { type: "string" },
            classification: { type: "string", enum: ["bullish", "bearish"] },
            logic: { description: conceptNode },
            new_blocks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, condition: { description: "As in CONDITIONS" } }, required: ["name", "condition"] }, description: "Blocks to create with this concept (names the logic uses)." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_trading_system",
        description:
          "Prepare a TRADING SYSTEM — the user's concepts plus every trading decision — for review, optionally publishing it as a version (a strategy to backtest, forward test and take live). Concepts must already exist (propose_concept first). Intraday: bullish concepts open longs, bearish ones open shorts; delivery is long only (bearish concepts can only close a long). Decide: instrument; timeframes (primary trades on; confirmation and higher are what concepts' blocks read on); product; sessions (no_entry_after, square_off_at, entry_windows, no_trade_windows); capital and max_capital_use_pct; position_sizing; stops/targets (multi-target exits with stop rules), risk_options (leverage, TP/SL reference price|margin, break-even, daily-loss and drawdown limits); conflict (both sides valid while flat): bullish | bearish | first | higher_timeframe | confidence | ignore | wait (+confirm_bars); when_long_bearish / when_short_bullish: ignore | exit | reverse, with opposite_confirm_bars to wait for confirmation; order_type. Pass `system` (name) to change an existing one; fields left out keep their saved values.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            system: { type: "string", description: "Name or id of an existing trading system to change" },
            description: { type: "string" },
            concepts: { type: "array", items: { type: "string" }, description: "The concepts it trades, by name (replaces the list)." },
            instrument_symbol: { type: "string" },
            timeframe: { type: "string", description: "Primary timeframe: 1m 3m 5m 15m 30m 60m 4h 1d 1wk" },
            confirmation_timeframe: { type: ["string", "null"] },
            higher_timeframe: { type: ["string", "null"] },
            product: { type: "string", enum: ["intraday", "delivery"] },
            no_entry_after: { type: ["string", "null"] },
            square_off_at: { type: ["string", "null"] },
            entry_windows: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } }, description: "Only open positions inside these IST windows" },
            no_trade_windows: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } }, description: "Never open positions inside these IST windows" },
            capital: { type: "number", description: "The system's capital in ₹ (backtests and forward tests start here)" },
            max_capital_use_pct: { type: "number", description: "Most of capital × leverage one position may use (1–100)" },
            position_sizing: { type: "object", properties: { mode: { type: "string", enum: ["FULL_CAPITAL", "FIXED_QUANTITY", "FIXED_CAPITAL", "PERCENT_OF_CAPITAL", "RISK_PERCENT"] }, value: { type: "number" } } },
            max_entries: { type: "number", description: "Entries per position (above 1, a same-side setup adds)" },
            stop_loss: { anyOf: [riskLegSchema, { type: "null" }] },
            take_profit: { anyOf: [riskLegSchema, { type: "null" }] },
            trailing_stop: { anyOf: [riskLegSchema, { type: "null" }] },
            targets: { anyOf: [targetsSchema, { type: "null" }] },
            entry_plan: { anyOf: [entryPlanSchema, { type: "null" }] },
            risk_options: riskOptionsSchema,
            conflict: { type: "string", enum: ["bullish", "bearish", "first", "higher_timeframe", "confidence", "ignore", "wait"] },
            conflict_confirm_bars: { type: "number" },
            when_long_bearish: { type: "string", enum: ["ignore", "exit", "reverse"] },
            when_short_bullish: { type: "string", enum: ["ignore", "exit", "reverse"] },
            opposite_confirm_bars: { type: "number", description: "Wait for confirmation: candles the opposite setup must hold before acting (0 = at once)" },
            order_type: { type: "string", enum: ["market", "limit"] },
            limit_percent: { type: "number" },
            limit_price: { type: "number" },
            publish: { type: "boolean" },
            note: { type: "string" },
          },
        },
      },
    },
  ];
}

// ---------- get_my_workspace ----------

export async function getMyWorkspace(userId: string): Promise<Outcome> {
  const [blocks, concepts, systems] = await Promise.all([
    prisma.block.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 40 }),
    prisma.concept.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 40 }),
    prisma.workspace.findMany({ where: { userId, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, take: 20 }),
  ]);
  const allBlocks = await prisma.block.findMany({ where: { userId }, select: { id: true, name: true } });
  const names = Object.fromEntries(allBlocks.map((b) => [b.id, { name: b.name }]));
  const conceptNames = new Map((await prisma.concept.findMany({ where: { userId }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const defs = systems.map((s) => parseSystemDefinition(s.draft));
  const syms = new Map((await prisma.instrument.findMany({ where: { id: { in: defs.map((d) => d?.instrumentId).filter((x): x is string => !!x) } }, select: { id: true, symbol: true } })).map((i) => [i.id, i.symbol]));
  return {
    result: {
      blocks: blocks.map((b) => {
        const d = parseBlockDefinition(b.definition);
        return { name: b.name, rule: d ? text(d.condition) : "(invalid)", link: `/app/workspaces/blocks/${b.id}` };
      }),
      concepts: concepts.map((c) => {
        const d = parseConceptDefinition(c.definition);
        return { name: c.name, side: c.classification.toLowerCase(), setup: d ? describeConcept(d, names) : "(invalid)", link: `/app/workspaces/concepts/${c.id}` };
      }),
      tradingSystems: systems.map((s, i) => {
        const d = defs[i];
        return {
          name: s.name,
          status: s.status,
          versionsPublished: s.latestVersion,
          instrument: d ? (syms.get(d.instrumentId) ?? null) : null,
          timeframes: d?.timeframes,
          product: d?.productType,
          concepts: d?.concepts.map((c) => `${conceptNames.get(c.conceptId) ?? "(deleted)"}${c.enabled ? "" : " (off)"}`) ?? [],
          conflict: d?.conflict.rule,
          whenLongBearish: d?.opposite.whenLong,
          whenShortBullish: d?.opposite.whenShort,
          link: `/app/workspaces/${s.id}`,
        };
      }),
    },
  };
}

// ---------- propose_block ----------

export async function proposeBlock(userId: string, a: Record<string, unknown>, h: SystemToolHelpers): Promise<Outcome> {
  const fix = (m: string) => ({ result: { error: `${m} Fix it and call propose_block again.` } });
  let existing: { id: string; name: string; description: string | null } | null = null;
  if (str(a.block)) {
    const f = await findBlock(userId, str(a.block));
    if (!f) return fix(`No block called "${str(a.block)}". Call get_my_workspace, or omit "block" to create a new one.`);
    if ("ambiguous" in f) return { result: { error: `"${str(a.block)}" matches several blocks (${f.ambiguous.join(", ")}). Ask the user which one.` } };
    existing = f;
  }
  const name = (str(a.name) || existing?.name || "").slice(0, 80);
  if (!name) return fix("A name is required, e.g. \"My BOS\".");
  try {
    const condition = await withCustom(userId, toConditionNode(a.condition, "condition"));
    const definition: BlockDefinition = { schema: 1, condition };
    if (!parseBlockDefinition(definition)) return fix("The condition isn't a valid rule.");
    const issues = blockProblems(definition, name);
    if (!existing && (await prisma.block.findFirst({ where: { userId, nameNormalized: name.toLowerCase() }, select: { id: true } }))) return fix(`The user already has a block called "${name}". Pass block:"${name}" to change it, or choose another name.`);
    const t = text(condition);
    return {
      result: { ok: true, rule: t, warnings: issues.map((i) => i.message), note: NOTE },
      proposal: { kind: "block", status: "pending", draft: { name, description: str(a.description) || existing?.description || undefined, ...(existing ? { blockId: existing.id } : {}), definition, text: t } },
    };
  } catch (err) {
    return fix(h.readableIssues(err));
  }
}

// ---------- propose_concept ----------

export async function proposeConcept(userId: string, a: Record<string, unknown>, h: SystemToolHelpers): Promise<Outcome> {
  const fix = (m: string) => ({ result: { error: `${m} Fix it and call propose_concept again.` } });
  let existing: { id: string; name: string; description: string | null; classification: string; definition: unknown } | null = null;
  if (str(a.concept)) {
    const f = await findConcept(userId, str(a.concept));
    if (!f) return fix(`No concept called "${str(a.concept)}". Call get_my_workspace, or omit "concept" to create a new one.`);
    if ("ambiguous" in f) return { result: { error: `"${str(a.concept)}" matches several concepts (${f.ambiguous.join(", ")}). Ask the user which one.` } };
    existing = f;
  }
  const name = (str(a.name) || existing?.name || "").slice(0, 80);
  if (!name) return fix("A name is required, e.g. \"My Bullish SMC Entry\".");
  if (!existing && (await prisma.concept.findFirst({ where: { userId, nameNormalized: name.toLowerCase() }, select: { id: true } }))) return fix(`The user already has a concept called "${name}". Pass concept:"${name}" to change it, or choose another name.`);
  const cls = str(a.classification).toUpperCase();
  const classification = cls === "BULLISH" || cls === "BEARISH" ? cls : existing ? parseConceptClass(existing.classification) : null;
  if (!classification) return fix('classification is required: "bullish" or "bearish".');

  try {
    // Blocks created in the same review, then every block the user already has.
    const newBlocks: { name: string; definition: BlockDefinition; text: string }[] = [];
    for (const [i, nb] of (Array.isArray(a.new_blocks) ? a.new_blocks : []).slice(0, 12).entries()) {
      if (!isObj(nb) || !str(nb.name)) return fix(`new_blocks #${i + 1}: needs a name and a condition.`);
      const bName = str(nb.name).slice(0, 80);
      if (await prisma.block.findFirst({ where: { userId, nameNormalized: bName.toLowerCase() }, select: { id: true } })) return fix(`new_blocks: the user already has a block called "${bName}" — reference it in the logic instead of creating it again.`);
      const condition = await withCustom(userId, toConditionNode(nb.condition, `new_blocks #${i + 1}.condition`));
      const issues = blockProblems({ schema: 1, condition }, bName);
      if (issues.length) return fix(issues.map((x) => x.message).join(" "));
      newBlocks.push({ name: bName, definition: { schema: 1, condition }, text: text(condition) });
    }
    const userBlocks = await prisma.block.findMany({ where: { userId }, select: { id: true, name: true, definition: true } });
    const blockOf = (ref: string): string | null => {
      const r = ref.trim().toLowerCase();
      const fresh = newBlocks.find((b) => b.name.toLowerCase() === r);
      if (fresh) return `new:${fresh.name}`;
      const own = userBlocks.find((b) => b.id === ref.trim() || b.name.toLowerCase() === r);
      return own?.id ?? null;
    };
    const base = existing ? parseConceptDefinition(existing.definition) : null;
    const logic = a.logic !== undefined ? conceptLogicFrom(a.logic, blockOf) : (base?.logic ?? null);
    if (!logic) return fix("logic is required: the blocks and how they combine.");
    const definition = { schema: 1 as const, logic };
    const lookup: Record<string, { name: string; definition: BlockDefinition }> = {};
    for (const b of userBlocks) {
      const d = parseBlockDefinition(b.definition);
      if (d) lookup[b.id] = { name: b.name, definition: d };
    }
    for (const b of newBlocks) lookup[`new:${b.name}`] = { name: b.name, definition: b.definition };
    const issues = conceptProblems(definition, lookup, name);
    if (issues.length) return fix(issues.map((x) => x.message).join(" "));
    const unused = newBlocks.filter((b) => !conceptBlockIds(logic).includes(`new:${b.name}`));
    const t = describeConcept(definition, lookup);
    return {
      result: { ok: true, setup: t, ...(unused.length ? { warnings: [`Not used in the logic: ${unused.map((b) => b.name).join(", ")}.`] } : {}), note: NOTE },
      proposal: { kind: "concept", status: "pending", draft: { name, description: str(a.description) || existing?.description || undefined, ...(existing ? { conceptId: existing.id } : {}), classification, definition, newBlocks, text: t } },
    };
  } catch (err) {
    return fix(h.readableIssues(err));
  }
}

// ---------- propose_trading_system ----------

const CONFLICT: Record<string, ConflictRule> = { bullish: "BULLISH", bearish: "BEARISH", first: "FIRST", higher_timeframe: "HIGHER_TIMEFRAME", confidence: "CONFIDENCE", ignore: "IGNORE", wait: "WAIT" };
const OPPOSITE: Record<string, OppositeAction> = { ignore: "IGNORE", exit: "EXIT", reverse: "REVERSE" };

export async function proposeTradingSystem(userId: string, a: Record<string, unknown>, h: SystemToolHelpers): Promise<Outcome> {
  const fix = (m: string) => ({ result: { error: `${m} Fix it and call propose_trading_system again.` } });
  let existing: { id: string; name: string; description: string | null; draft: unknown } | null = null;
  if (str(a.system)) {
    const f = await findSystem(userId, str(a.system));
    if (!f) return fix(`No trading system called "${str(a.system)}". Call get_my_workspace, or omit "system" to create a new one.`);
    if ("ambiguous" in f) return { result: { error: `"${str(a.system)}" matches several trading systems (${f.ambiguous.join(", ")}). Ask the user which one.` } };
    existing = f;
  }
  const base: TradingSystemDefinition = (existing ? parseSystemDefinition(existing.draft) : null) ?? emptySystem("");
  const name = (str(a.name) || existing?.name || "").slice(0, 80);
  if (!name) return fix("A name is required for a new trading system.");

  try {
    const instrument = str(a.instrument_symbol) ? await h.findInstrument(str(a.instrument_symbol)) : null;
    if (str(a.instrument_symbol) && !instrument) return fix(`Unknown instrument "${str(a.instrument_symbol)}". Call list_instruments and use an exact symbol.`);
    let concepts = base.concepts;
    if (Array.isArray(a.concepts)) {
      concepts = [];
      for (const ref of a.concepts.slice(0, SYSTEM_LIMITS.concepts)) {
        const c = await findConcept(userId, String(ref));
        if (!c) return fix(`The user has no concept "${String(ref)}". Call get_my_workspace for exact names, or create it with propose_concept first.`);
        if ("ambiguous" in c) return { result: { error: `"${String(ref)}" matches several concepts (${c.ambiguous.join(", ")}). Ask the user which one.` } };
        if (!concepts.some((x) => x.conceptId === c.id)) concepts.push({ conceptId: c.id, enabled: true });
      }
    }
    const primary = h.timeframeArg(a.timeframe) ?? base.timeframes.primary;
    const optTf = (k: string, cur: string | null) => (k in a ? (a[k] === null || a[k] === "" ? null : (h.timeframeArg(a[k]) ?? null)) : cur);
    const order = h.orderArgs(a);
    const intradayTf = /m$|h$/.test(primary);
    const productType = (order.productType as "INTRADAY" | "DELIVERY" | undefined) ?? (a.timeframe !== undefined ? (intradayTf ? "INTRADAY" : "DELIVERY") : base.productType);
    const windows = (v: unknown, cur: { startMinute: number; endMinute: number }[]) =>
      v === undefined ? cur : (Array.isArray(v) ? v : []).map((w, i) => {
        if (!isObj(w)) throw new Error(`window #${i + 1}: give {"from":"09:15","to":"10:00"}.`);
        const from = h.clockArg(w.from);
        const to = h.clockArg(w.to);
        if (from == null || to == null) throw new Error(`window #${i + 1}: give both "from" and "to", e.g. "09:15".`);
        return { startMinute: from, endMinute: to };
      });
    const pickLeg = (key: string, saved: TradingSystemDefinition["stopLoss"]) => (key in a ? (a[key] === null ? { enabled: false, unit: "PERCENT" as const, value: 0 } : h.leg(a[key])) : saved);
    const noEntry = h.clockArg(a.no_entry_after);
    const squareOff = h.clockArg(a.square_off_at);
    const maxEntries = Math.max(1, Math.floor(num(a.max_entries) ?? base.maxPyramidEntries));
    const targets = targetsFrom(a.targets);
    const plan = entryPlanFrom(a.entry_plan, maxEntries);
    const conflictArg = str(a.conflict).toLowerCase();
    if (conflictArg && !CONFLICT[conflictArg]) throw new Error(`conflict must be one of ${Object.keys(CONFLICT).join(", ")}.`);
    const opp = (k: string, cur: OppositeAction) => {
      const v = str(a[k]).toLowerCase();
      if (!v) return cur;
      if (!OPPOSITE[v]) throw new Error(`${k} must be ignore, exit or reverse.`);
      return OPPOSITE[v];
    };
    const sizing = h.sizingFrom(a.position_sizing, { mode: base.positionSizingMode, value: base.positionSizingValue });
    const riskOptions = riskOptionsFrom(a.risk_options, base.riskOptions) ?? base.riskOptions;

    const def: TradingSystemDefinition = {
      ...base,
      concepts,
      instrumentId: instrument?.id ?? base.instrumentId,
      timeframes: { primary, confirmation: optTf("confirmation_timeframe", base.timeframes.confirmation), higher: optTf("higher_timeframe", base.timeframes.higher) },
      productType,
      sessions: {
        noEntryAfterMinute: noEntry === undefined ? base.sessions.noEntryAfterMinute : noEntry,
        squareOffMinute: squareOff === undefined ? base.sessions.squareOffMinute : squareOff,
        entryWindows: windows(a.entry_windows, base.sessions.entryWindows),
        noTradeWindows: windows(a.no_trade_windows, base.sessions.noTradeWindows),
      },
      capital: { total: num(a.capital) ?? base.capital.total, maxUtilizationPercent: num(a.max_capital_use_pct) ?? base.capital.maxUtilizationPercent },
      positionSizingMode: sizing.mode,
      positionSizingValue: sizing.value,
      riskOptions: productType === "DELIVERY" ? { ...riskOptions, leverage: 1, reference: "PRICE" } : riskOptions,
      stopLoss: pickLeg("stop_loss", base.stopLoss),
      target: pickLeg("take_profit", base.target),
      trailingSl: pickLeg("trailing_stop", base.trailingSl),
      targets: targets === undefined ? base.targets : (targets ?? []),
      entryPlan: plan === undefined ? base.entryPlan : plan,
      maxPyramidEntries: maxEntries,
      conflict: { rule: conflictArg ? CONFLICT[conflictArg] : base.conflict.rule, confirmBars: Math.max(conflictArg === "wait" ? 1 : 0, Math.floor(num(a.conflict_confirm_bars) ?? base.conflict.confirmBars)) },
      opposite: { whenLong: opp("when_long_bearish", base.opposite.whenLong), whenShort: opp("when_short_bullish", base.opposite.whenShort), confirmBars: Math.max(0, Math.floor(num(a.opposite_confirm_bars) ?? base.opposite.confirmBars)) },
      orderType: (order.orderType as "MARKET" | "LIMIT" | undefined) ?? base.orderType,
      limitMode: order.limitMode !== undefined ? (order.limitMode as "PERCENT" | "PRICE" | null) : base.limitMode,
      limitValue: order.limitValue !== undefined ? order.limitValue : base.limitValue,
    };
    if (!CONFLICT_RULES.includes(def.conflict.rule)) throw new Error("Unknown conflict rule.");

    const checked = await checkSystem(userId, def);
    if (checked.errors.length) return fix(`It didn't pass the checks: ${checked.errors.map((e) => `${e.where ? `${e.where}: ` : ""}${e.message}`).join(" ")}`);
    let finalName = name;
    if (!existing) for (let n = 2; n < 50 && (await prisma.workspace.findFirst({ where: { userId, nameNormalized: finalName.toLowerCase() }, select: { id: true } })); n++) finalName = `${name.slice(0, 74)} (${n})`;
    const conceptsText = checked.concepts.map((c) => ({ name: c.name, classification: parseConceptClass(c.classification), text: c.text }));
    return {
      result: { ok: true, concepts: conceptsText.map((c) => `${c.name} (${c.classification.toLowerCase()}): ${c.text}`), warnings: checked.warnings.map((w) => w.message), note: NOTE },
      proposal: {
        kind: "workspace",
        status: "pending",
        draft: {
          name: finalName,
          description: str(a.description) || existing?.description || undefined,
          ...(existing ? { workspaceId: existing.id } : {}),
          definition: def,
          instrumentSymbol: checked.instrumentSymbol,
          concepts: conceptsText,
          warnings: checked.warnings.map((w) => w.message),
          publish: a.publish === true,
          ...(str(a.note) ? { note: str(a.note).slice(0, 200) } : {}),
        },
      },
    };
  } catch (err) {
    return fix(h.readableIssues(err));
  }
}
