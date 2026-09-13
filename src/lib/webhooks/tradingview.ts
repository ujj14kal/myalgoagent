export type WebhookAction = "BUY" | "SELL";

export interface ParsedWebhookPayload {
  action?: WebhookAction;
  error?: string;
}

const BUY_WORDS = /\b(buy|long|enter)\b/i;
const SELL_WORDS = /\b(sell|short|exit|close)\b/i;

function wordsToAction(text: string): WebhookAction | undefined {
  const isBuy = BUY_WORDS.test(text);
  const isSell = SELL_WORDS.test(text);
  if (isBuy && !isSell) return "BUY";
  if (isSell && !isBuy) return "SELL";
  return undefined;
}

/**
 * TradingView alerts arrive as either a JSON body (a user-defined payload,
 * typically `{"action":"BUY",...}` or similar) or a plain-text alert
 * message. Both are supported since TradingView lets the user pick either
 * format when setting up an alert, and we can't control which one they use.
 */
export function parseTradingViewPayload(raw: string): ParsedWebhookPayload {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Empty request body" };

  try {
    const json: unknown = JSON.parse(trimmed);
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      const candidate = record.action ?? record.side ?? record.signal ?? record.order;
      if (typeof candidate === "string") {
        const action = wordsToAction(candidate);
        if (action) return { action };
        return { error: `Could not determine BUY or SELL from "action" field: "${candidate}"` };
      }
    }
    return { error: 'JSON body did not contain a recognizable "action"/"side"/"signal" field' };
  } catch {
    // Not JSON — fall through to plain-text matching.
  }

  const action = wordsToAction(trimmed);
  if (action) return { action };
  return { error: "Could not determine BUY or SELL from payload" };
}
