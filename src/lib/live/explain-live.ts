import { conditionToText } from "@/lib/strategy/format";
import type { ConditionNode } from "@/lib/strategy/types";
import { inMarketWindow } from "@/lib/paper/market-window";

// Plain-English answer to "what is this live strategy doing, and why hasn't it traded?" —
// built only from facts we hold (its state, the clock, its last order). Nothing is guessed:
// when the reason can't be known from these facts, it says what to look at.

export type LiveStatusInput = {
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  now: Date;
  startedAt: Date;
  lastCheckedAt: Date | null;
  lastError: string | null;
  positionQty: number;
  positionAvgPrice: number | null;
  direction: "LONG" | "SHORT";
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  symbol: string;
  lastOrder?: { side: string; quantity: number; status: string; rejectReason: string | null; createdAt: Date } | null;
};
export type LiveStatus = { tone: "ok" | "wait" | "warn"; headline: string; detail?: string };

const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const istMinute = (d: Date) => {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const timeText = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const STALE_MS = 3 * 60_000;

/** A rule that is only a clock window ("time between 11:03 and 11:04"), else null. */
function timeWindow(node: ConditionNode): { start: number; end: number } | null {
  if (node.kind === "signal" && node.signal.family === "TIME_WINDOW") return { start: node.signal.startMinute, end: node.signal.endMinute };
  return null;
}

export function explainLive(i: LiveStatusInput): LiveStatus {
  const sym = i.symbol.replace(/\.NS$/, "");
  const side = i.direction === "SHORT" ? "SELL" : "BUY";
  const checked = i.lastCheckedAt ? `Last checked ${timeText(i.lastCheckedAt)} IST.` : "Not checked yet.";

  if (i.status === "STOPPED") return { tone: "wait", headline: "Stopped", detail: "It no longer sends orders. A position it opened stays open until you close it." };
  if (i.status === "PAUSED") return { tone: "warn", headline: "Paused — no orders are being sent", detail: i.lastError ?? "You paused it. Press Resume to continue." };

  if (i.positionQty > 0) {
    const exit = timeWindow(i.exitCondition);
    return {
      tone: "ok",
      headline: `Holding ${i.positionQty} ${sym}${i.positionAvgPrice ? ` at ₹${i.positionAvgPrice.toFixed(2)}` : ""}`,
      detail: `${exit ? `Exit rule: from ${clock(exit.start)} IST.` : `Exit rule: ${conditionToText(i.exitCondition)}.`} Stop-loss, target and square-off apply too. ${checked}`,
    };
  }

  if (!inMarketWindow(i.now)) return { tone: "wait", headline: "Market closed", detail: `Checks resume when NSE opens (09:15 IST, Mon–Fri). ${checked}` };

  if (!i.lastCheckedAt || i.now.getTime() - i.lastCheckedAt.getTime() > STALE_MS) {
    return { tone: "warn", headline: "Not being checked right now", detail: `${i.lastCheckedAt ? `The last check was at ${timeText(i.lastCheckedAt)} IST.` : "It has not been checked yet."} The live engine may be down — the backup should resume within a minute; if this stays, tell support.` };
  }

  if (i.lastOrder && (i.lastOrder.status === "REJECTED" || i.lastOrder.status === "FAILED") && istDay(i.lastOrder.createdAt) === istDay(i.now)) {
    return { tone: "warn", headline: `Its last order (${i.lastOrder.side} ${i.lastOrder.quantity}) was not accepted`, detail: `${i.lastOrder.rejectReason ?? i.lastOrder.status}. ${checked}` };
  }

  const w = timeWindow(i.entryCondition);
  if (w) {
    const now = istMinute(i.now);
    if (now < w.start) return { tone: "wait", headline: `Waiting for its entry time, ${clock(w.start)} IST`, detail: `It will send a ${side} order for ${sym} then — about ${w.start - now} minute${w.start - now === 1 ? "" : "s"} from now. ${checked}` };
    if (now <= w.end) return { tone: "ok", headline: "Its entry time is now", detail: `The entry window (${clock(w.start)}–${clock(w.end)}) is open; the next check sends the ${side} order. ${checked}` };
    const startedAfter = istDay(i.startedAt) === istDay(i.now) && istMinute(i.startedAt) > w.end;
    return {
      tone: "wait",
      headline: `Today's entry time (${clock(w.start)}) has passed without an order`,
      detail: startedAfter
        ? `It was started after the entry window, so its first entry is tomorrow at ${clock(w.start)}. ${checked}`
        : `It enters again tomorrow at ${clock(w.start)}. If it should have entered today, look at the capital (it must cover the first position) and at Today's live orders. ${checked}`,
    };
  }

  return { tone: "wait", headline: `Watching ${sym}`, detail: `It sends a ${side} order the first time this is true on a closed candle: ${conditionToText(i.entryCondition)}. ${checked}` };
}
