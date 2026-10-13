// The in-page "Build with the assistant" windows (indicator, block, concept, strategy) start every message with a tag the
// server recognises. The tag adds a standing instruction to the system prompt (never to the user's text), so the same
// guided order holds on every turn of that conversation:
//   1. explain the idea in plain words and ask how THEY define it (with a few ready-made definitions to pick from);
//   2. once they have answered, prepare it — nothing is created until they have seen a demo and confirmed.

/** What the Custom Indicators page's "Describe it" box starts its message with — the server recognises it. */
export const DESCRIBE_PREFIX = "Make me a custom indicator: ";
export const DESCRIBE_BLOCK_PREFIX = "Make me a block: ";
export const DESCRIBE_CONCEPT_PREFIX = "Make me a concept: ";
export const TALK_STRATEGY_PREFIX = "Help me build a strategy: ";

const GUIDED_ORDER =
  "Follow this order in this conversation. STEP 1 — if the user has not yet said, in this conversation, how THEY define it: do not prepare anything yet and call no propose_ tool. In two or three plain sentences explain what the idea means in the market (no jargon without a quick gloss), then ask how they would define it, offering 2 to 4 concrete definitions on separate lines that start with “• ” (each a complete definition they could simply pick, e.g. “• Volume at least 2× its 20-candle average for 3 candles in a row”), and end by asking which fits or to write their own. STEP 2 — once they have answered (they may pick one or write their own): prepare it in a single call. Say in one or two sentences what you made, and that a demo on a made-up stock will show how it looks before anything is created — they review it, see the demo, and only then does it get created. Never create or save anything yourself.";

// Two more things the indicator window asks in STEP 1, alongside the definition: how it should be shown, and when it should signal an entry.
const INDICATOR_EXTRAS =
  "In STEP 1, besides the definition, ALSO ask (in the same message, as two short separate questions, each with its own “• ” choices) (a) HOW IT SHOULD BE SHOWN: a graph line in its own pane, a line on the price chart, signal markers, a horizontal level, a zone, a range (a rectangle between two dates), a channel or a band; and (b) ITS ENTRY RULE: when should it count as an entry signal, e.g. “• Crosses above 0”, “• Goes below 30”, “• Price crosses above it” (for price-type indicators) or “• No entry rule for now”. In STEP 2 pass their choices as kind, and entry_operator / entry_value (omit entry_value for a price-versus-indicator rule; omit both if they want no entry rule). The entry rule is filled in automatically whenever that indicator is picked in a strategy's entry condition, and the user can still change it there. ";

export const DESCRIBE_INSTRUCTION =
  "\n\nThis message came from the app's Custom Indicators window. Build ONLY the indicator, with propose_custom_indicator — no strategy, no stock and no timeframe questions. Pick the kind that matches the words (graph line, price overlay, signal markers, level, zone, rectangle, channel or band) and write a formula or levels the user can read. Take their words literally: “box”, “rectangle”, “order block”, “supply/demand block” or “range box” means kind rectangle (fixed upper and lower prices plus a from and to date), NEVER a channel or band, which are moving lines; use channel or band only when they say channel, band or envelope. If you lack the prices or dates for a box, ask for them (offer the recent swing high/low as choices) instead of switching to another kind. " +
  INDICATOR_EXTRAS +
  GUIDED_ORDER;

export const DESCRIBE_BLOCK_INSTRUCTION =
  "\n\nThis message came from the app's Block window. Build ONLY a block, with propose_block: one reusable market component as a rule (e.g. a break of structure, a fair value gap, an order-block retest, a liquidity sweep, a level, a session window, a volume spike, a moving-average filter) — no instrument, no buy or sell, no size, stop or target, no strategy. Do not ask which stock. If the idea is really a setup of several components in order, say so in one line, suggest making it as a concept, and still prepare the single most important component. " +
  GUIDED_ORDER;

export const DESCRIBE_CONCEPT_INSTRUCTION =
  "\n\nThis message came from the app's Concept window. Build ONLY a concept, with propose_concept: blocks combined into one bullish or bearish setup, creating any block the user does not have yet in new_blocks. Never decide an instrument, size, stop or target. In STEP 1 also ask the two things a concept needs: is it bullish or bearish, and should the blocks be applied in SEQUENCE (one after another, within a number of candles) or ALL AT ONE TIME (on the same candle) — offer those as the “• ” choices together with the definitions of any block that is unclear. " +
  GUIDED_ORDER;

export const TALK_STRATEGY_INSTRUCTION =
  "\n\nThis message came from the app's Talk-to-agent window next to “New strategy”. Help the user build a strategy with propose_strategy. If something essential is missing (what should trigger the entry, or the stock), ask ONE short question first, offering a few “• ” choices; otherwise prepare it straight away, using RELIANCE.NS on daily candles when no stock was named and saying so in one line. Say in one sentence what you made; they review it before anything is created.";

const TAGS: [string, string][] = [
  [DESCRIBE_PREFIX, DESCRIBE_INSTRUCTION],
  [DESCRIBE_BLOCK_PREFIX, DESCRIBE_BLOCK_INSTRUCTION],
  [DESCRIBE_CONCEPT_PREFIX, DESCRIBE_CONCEPT_INSTRUCTION],
  [TALK_STRATEGY_PREFIX, TALK_STRATEGY_INSTRUCTION],
];

export const isDescribe = (text: string) => text.startsWith(DESCRIBE_PREFIX);
export const isDescribeBlock = (text: string) => text.startsWith(DESCRIBE_BLOCK_PREFIX);

/** The extra system-prompt instruction for a message that carries one of the tags ("" for any other message). */
export const describeInstructionFor = (text: string) => TAGS.find(([tag]) => text.startsWith(tag))?.[1] ?? "";

/** The user's own words, without the tag the window added. */
export const stripDescribeTag = (text: string) => {
  const hit = TAGS.find(([tag]) => text.startsWith(tag));
  return hit ? text.slice(hit[0].length) : text;
};
