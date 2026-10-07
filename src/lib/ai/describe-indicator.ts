/** What the Custom Indicators page's "Describe it" box starts its message with — the server recognises it. */
export const DESCRIBE_PREFIX = "Make me a custom indicator and a strategy that uses it: ";

/** Added to the system prompt (never the user's text) for such a message: build now, don't stop to ask which stock. */
export const DESCRIBE_INSTRUCTION =
  "\n\nThis message came from the app's Describe-it box. Build it now with propose_strategy and custom_indicators. Do not ask which stock, timeframe or rule first: use RELIANCE.NS on daily candles unless the user named something else, choose the entry, exit and stop-loss that follow from the idea, and say in one line what you chose — the user will change anything in the preview.";

export const isDescribe = (text: string) => text.startsWith(DESCRIBE_PREFIX);
