"use client";

import { useState, useTransition } from "react";
import { friendlyError } from "@/lib/friendly-error";
import { ArrowDownRight, ArrowUpRight, PlayCircle, RefreshCw } from "lucide-react";
import CandlestickChart from "@/components/candlestick-chart";
import StrategyReplay from "@/components/strategy-replay";
import { previewStrategy } from "@/lib/strategy-preview-actions";
import type { PreviewTrade, StrategyPreview as Preview } from "@/lib/strategy-preview";
import type { StrategyInput } from "@/lib/strategy-actions";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (t: number, intraday = false) => {
  const d = new Date(t * 1000);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return intraday ? `${date}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })}` : date;
};

const EXIT_REASON: Record<NonNullable<PreviewTrade["exitReason"]>, string> = {
  exit_rule: "the exit rule was met",
  stop_loss: "the stop-loss was hit",
  target: "the take-profit was hit",
  trailing_stop: "the trailing stop was hit",
  locked_profit: "the profit locked by an earlier target was reached",
  square_off: "the intraday square-off time was reached",
  end_of_data: "still open at the end of the period (closed for this demo)",
};

/**
 * "See it in action": shows where the strategy being built would have entered
 * and exited on the last 6 months of data, and why — before it's saved.
 */
export default function StrategyPreview({ buildInput, direction }: { buildInput: () => StrategyInput; direction: "LONG" | "SHORT" }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const res = await previewStrategy(buildInput()).catch((err: unknown) => ({ ok: false as const, error: friendlyError(err, "We couldn't run the demo. Please try again.") }));
      if (res.ok) setPreview(res.preview);
      else {
        setPreview(null);
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-60"
        >
          {isPending ? <RefreshCw size={15} className="animate-spin" /> : preview ? <RefreshCw size={15} /> : <PlayCircle size={15} />}
          {isPending ? "Running…" : preview ? "Update the demo" : "Show how it trades"}
        </button>
        <p className="text-xs text-brand-navy/50">Runs your rules on recent data for the chosen timeframe. Nothing is saved.</p>
      </div>

      {error && <p className="mt-3 rounded-lg bg-brand-sell/[0.06] px-3 py-2 text-sm text-brand-sell">{error}</p>}

      {preview && <PreviewResultView preview={preview} direction={direction} />}
    </div>
  );
}

/** The demo itself: chart with entries/exits, a summary and the latest trades in words. */
export function PreviewResultView({ preview, direction }: { preview: Preview; direction: "LONG" | "SHORT" }) {
  const markers = preview.trades.flatMap((t) => [
    { time: t.entryTime, type: "entry" as const },
    { time: t.exitTime, type: "exit" as const },
  ]);
  const recent = [...preview.trades].reverse().slice(0, 4);
  const buyWord = direction === "LONG" ? "Bought" : "Sold short";
  const sellWord = direction === "LONG" ? "Sold" : "Bought back";
  return (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-brand-bg px-3 py-1 font-semibold text-brand-navy ring-1 ring-black/5">{preview.symbol}</span>
            <span className="rounded-full bg-brand-bg px-3 py-1 text-brand-navy/70 ring-1 ring-black/5">
              {preview.timeframeLabel} · last {preview.periodLabel}
            </span>
            <span className="rounded-full bg-brand-bg px-3 py-1 text-brand-navy/70 ring-1 ring-black/5">
              {preview.trades.length} trade{preview.trades.length === 1 ? "" : "s"}
            </span>
            {preview.trades.length > 0 && (
              <>
                <span className="rounded-full bg-brand-bg px-3 py-1 text-brand-navy/70 ring-1 ring-black/5">{preview.winRatePct.toFixed(0)}% winners</span>
                <span className={`rounded-full px-3 py-1 font-semibold ring-1 ring-black/5 ${preview.totalReturnPct >= 0 ? "bg-brand-buy/10 text-brand-buy" : "bg-brand-sell/10 text-brand-sell"}`}>
                  {preview.totalReturnPct >= 0 ? "+" : ""}
                  {preview.totalReturnPct.toFixed(2)}% on {inr(preview.capital)}
                </span>
              </>
            )}
          </div>

          {preview.trades.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Watch a trade play out</p>
              <StrategyReplay preview={preview} />
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Every entry and exit in the last {preview.periodLabel}</p>
            <div className="overflow-hidden rounded-xl ring-1 ring-black/5">
              <CandlestickChart candles={preview.candles} markers={markers} />
            </div>
          </div>

          {preview.trades.length === 0 ? (
            <p className="rounded-lg bg-brand-bg px-4 py-3 text-sm text-brand-navy/70 ring-1 ring-black/5">
              The entry rule didn&apos;t trigger in the last {preview.periodLabel}, so no trade would have been taken. Try loosening it, or pick another instrument.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">How the latest trades played out</p>
              <ul className="space-y-2">
                {recent.map((t) => (
                  <li key={t.entryTime} className="rounded-lg bg-white p-3 text-sm ring-1 ring-black/5">
                    <p className="flex items-start gap-2 text-brand-navy/80">
                      <ArrowUpRight size={15} className="mt-0.5 shrink-0 text-brand-buy" />
                      <span>
                        <strong className="font-semibold text-brand-navy">{buyWord}</strong> {t.quantity} on {day(t.entryTime, preview.intraday)} at {inr(t.entryPrice)}, because{" "}
                        <span className="font-medium text-brand-navy">{t.entryReason}</span>.
                      </span>
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-brand-navy/80">
                      <ArrowDownRight size={15} className="mt-0.5 shrink-0 text-brand-sell" />
                      <span>
                        <strong className="font-semibold text-brand-navy">{sellWord}</strong> on {day(t.exitTime, preview.intraday)} at {inr(t.exitPrice)}, because {EXIT_REASON[t.exitReason ?? "exit_rule"]}
                        {t.exitReason === "exit_rule" && (t.exitRuleReason ?? preview.exitRule) ? (
                          <>
                            {" "}(<span className="font-medium text-brand-navy">{t.exitRuleReason ?? preview.exitRule}</span>)
                          </>
                        ) : null}
                        .{" "}
                        <span className={`font-semibold ${t.netPnl >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                          {t.netPnl >= 0 ? "+" : ""}
                          {inr(t.netPnl)} ({t.netPnlPct >= 0 ? "+" : "−"}
                          {Math.abs(t.netPnlPct).toFixed(2)}%)
                        </span>
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-brand-navy/45">
            Demo on {preview.periodLabel} of {preview.dataSource} {preview.timeframeLabel} candles, entries by {preview.entryOrderLabel}, with ₹1,00,000, 0.03% brokerage and 0.05% slippage. Past results don&apos;t guarantee future results. Run a
            full backtest after saving for complete metrics.
          </p>
        </div>
  );
}
