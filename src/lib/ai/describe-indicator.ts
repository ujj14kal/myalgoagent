/** What the Custom Indicators page's "Describe it" box starts its message with — the server recognises it. */
export const DESCRIBE_PREFIX = "Make me a custom indicator and a strategy that uses it: ";

/** The standing instruction added (for the model only) to such a message: build now, never stop to ask which stock. */
export const DESCRIBE_INSTRUCTION =
  "\n\n[Instruction from the app: build this now with propose_strategy and custom_indicators. Do NOT ask which stock, timeframe or rule first. Use RELIANCE.NS on daily candles unless the user named something else, choose a sensible entry, exit and stop-loss from the idea, and say in one line what you chose — they will change anything in the preview.]";

export const forDescribe = (text: string) => (text.startsWith(DESCRIBE_PREFIX) ? text + DESCRIBE_INSTRUCTION : text);
