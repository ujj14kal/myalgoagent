/** What the Custom Indicators page's "Describe it" box starts its message with — the server recognises it. */
export const DESCRIBE_PREFIX = "Make me a custom indicator: ";

/** Added to the system prompt (never the user's text) for such a message: build the indicator alone, now. */
export const DESCRIBE_INSTRUCTION =
  "\n\nThis message came from the app's Describe-it box on the Custom Indicators page. Build ONLY the indicator, now, with propose_custom_indicator — no strategy, no stock and no timeframe questions. Pick the kind that matches the words (graph line, price overlay, signal markers, level, zone, rectangle, channel or band) and write a formula or levels the user can read. Say in one or two sentences what it measures and how to read it; they review it and press Save.";

export const isDescribe = (text: string) => text.startsWith(DESCRIBE_PREFIX);
