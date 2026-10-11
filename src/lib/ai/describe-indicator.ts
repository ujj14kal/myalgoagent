/** What the Custom Indicators page's "Describe it" box starts its message with — the server recognises it. */
export const DESCRIBE_PREFIX = "Make me a custom indicator: ";

/** Added to the system prompt (never the user's text) for such a message: build the indicator alone, now. */
export const DESCRIBE_INSTRUCTION =
  "\n\nThis message came from the app's Describe-it box on the Custom Indicators page. Build ONLY the indicator, now, with propose_custom_indicator — no strategy, no stock and no timeframe questions. Pick the kind that matches the words (graph line, price overlay, signal markers, level, zone, rectangle, channel or band) and write a formula or levels the user can read. Say in one or two sentences what it measures and how to read it; they review it and press Save.";

export const isDescribe = (text: string) => text.startsWith(DESCRIBE_PREFIX);

/** The same idea for the Workspace's block page: describe a market component and Mr. Agent proposes the block. */
export const DESCRIBE_BLOCK_PREFIX = "Make me a block: ";

export const DESCRIBE_BLOCK_INSTRUCTION =
  "\n\nThis message came from the app's Block page. Build ONLY a block, now, with propose_block: one reusable market component as a rule (e.g. a break of structure, a fair value gap, an order-block retest, a liquidity sweep, a level, a session window, a volume spike, a moving-average filter) — no instrument, no buy or sell, no size, stop or target, no strategy. Do not ask which stock. If the idea clearly has several components in order (a whole setup), say so in one line and still propose the single most important component as the block. Say in one or two sentences when the block is present; the user reviews it and presses Create block.";

export const isDescribeBlock = (text: string) => text.startsWith(DESCRIBE_BLOCK_PREFIX);

/** The extra system-prompt instruction for a message from either Describe-it box ("" for any other message). */
export const describeInstructionFor = (text: string) => (isDescribe(text) ? DESCRIBE_INSTRUCTION : isDescribeBlock(text) ? DESCRIBE_BLOCK_INSTRUCTION : "");
