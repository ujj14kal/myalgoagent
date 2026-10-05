import type { MantleTool } from "./mantle";

// The workspace tools as the agent sees them. The handlers live next to the other proposal tools in tools.ts.

const logicNode =
  'A node of the logic, one of: {"strategy":"<one of the strategies, by name or letter>","rule":"entry"|"exit"} (that strategy\'s own entry or exit rule); {"condition":<a rule, as in CONDITIONS>,"label":"<optional name>"} (a rule of your own: an indicator test, a time trigger, a pattern, a filter); {"connection":"AND"|"OR"|"SEQUENCE"|"CONFIRMATION"|"VETO"|"DEPENDENCY","bars":<candles>,"children":[<nodes>]} (a group). A bare list of nodes means AND.';

export function workspaceTools(riskLegSchema: object, targetsSchema: object, entryPlanSchema: object, styleSchema: object): MantleTool[] {
  return [
    {
      type: "function",
      function: {
        name: "get_my_workspaces",
        description: "List the user's workspaces: name, status, how many versions are published, what they trade, which strategies they connect, and their entry and exit logic in words.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_workspace",
        description:
          "Prepare a workspace (a plan that connects several of the user's strategies and rules) for them to review and confirm; nothing is saved until they confirm. Use when they want to combine strategies, add confirmations or filters from other strategies, or build a multi-level plan. Pass only what changes when updating an existing workspace (workspace = its name).\n" +
          "CONNECTIONS (each means exactly one thing; the first child is the main signal for CONFIRMATION, VETO and DEPENDENCY):\n" +
          "- AND: every child is true on the same candle. OR: any child is true.\n" +
          "- SEQUENCE: the children happen in the order listed, each within `bars` candles before the next; the last is true on this candle.\n" +
          "- CONFIRMATION: the first child is the signal; every other child must be true on this candle or within `bars` candles before it.\n" +
          "- VETO: the first child is the signal; it is blocked if any other child is true on this candle (or within `bars` candles).\n" +
          "- DEPENDENCY: the first child is a prerequisite that must have held on every one of the last `bars` candles; the other children must be true on this candle.\n" +
          "CHOOSE THE CONNECTION THAT MATCHES THE USER'S WORDS rather than flattening everything into one AND rule: \"unless\" / \"but not when\" / \"avoid when\" → VETO; \"confirmed by\" / \"and also had\" / \"at some point in the last N candles\" → CONFIRMATION; \"then\" / \"followed by\" / \"after … within N candles\" → SEQUENCE; \"only after … has held for N candles\" → DEPENDENCY; \"both on the same candle\" → AND; \"either\" → OR. The workspace is how users see and edit the structure, so keep it explicit.\n" +
          "Example: buy when strategy A's entry fires, confirmed by B's entry within 3 candles, unless the price is below the 200 SMA: {\"connection\":\"VETO\",\"children\":[{\"connection\":\"CONFIRMATION\",\"bars\":3,\"children\":[{\"strategy\":\"A\"},{\"strategy\":\"B\"}]},{\"condition\":\"close < sma(200)\"}]}.\n" +
          "A workspace is published as a version, which becomes an ordinary strategy to backtest, forward test and take live. Execution settings (stops, targets, entry plan, sizing) work exactly as in propose_strategy. Webhook strategies have no rules and can't be used.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Workspace name (required for a new one)" },
            workspace: { type: "string", description: "The name or id of an existing workspace to change" },
            description: { type: "string" },
            instrument_symbol: { type: "string", description: "NSE symbol like RELIANCE.NS" },
            direction: { type: "string", enum: ["LONG", "SHORT"] },
            style: styleSchema,
            timeframe: { type: "string", enum: ["1m", "3m", "5m", "15m", "30m", "60m", "4h", "1d", "1wk"], description: "Candle size every rule is checked on; swing and positional use 1d or 1wk (weekly)" },
            strategies: { type: "array", items: { type: "string" }, description: "The user's strategies to combine, by name or id (up to 20). They are lettered A, B, C… in this order. Required when the logic uses strategy rules." },
            entry: { description: "The entry logic. " + logicNode },
            exit: { description: "The exit logic, or null for none (the stops, targets or holding limit then close the position). " + logicNode },
            stop_loss: { anyOf: [riskLegSchema, { type: "null" }] },
            take_profit: { anyOf: [riskLegSchema, { type: "null" }] },
            trailing_stop: { anyOf: [riskLegSchema, { type: "null" }] },
            targets: { anyOf: [targetsSchema, { type: "null" }] },
            entry_plan: { anyOf: [entryPlanSchema, { type: "null" }] },
            position_sizing: {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["FULL_CAPITAL", "FIXED_QUANTITY", "FIXED_CAPITAL", "PERCENT_OF_CAPITAL", "RISK_PERCENT"] },
                value: { type: "number" },
              },
            },
            max_entries: { type: "number" },
            no_entry_after: { type: ["string", "null"], description: "Intraday only, IST, e.g. \"14:30\"" },
            square_off_at: { type: ["string", "null"], description: "Intraday only, IST, e.g. \"15:15\"" },
            publish: { type: "boolean", description: "Also publish it as the next version. Default false (save the draft only)." },
            note: { type: "string", description: "A short note for the published version" },
          },
        },
      },
    },
  ];
}
