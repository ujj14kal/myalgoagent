import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market-data";

export type Drawing =
  | { kind: "trendline"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "horizontal"; price: number }
  | { kind: "rectangle"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "fibonacci"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "text"; at: { time: number; price: number }; text: string }
  | { kind: "ray"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "arrow"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "circle"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "measure"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "anchoredVwap"; anchorTime: number }
  | { kind: "volumeProfile"; fromTime: number; toTime: number }
  | { kind: "longPosition" | "shortPosition"; entryTime: number; entryPrice: number; stopPrice: number; targetPrice: number };

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const VOLUME_PROFILE_BIN_COUNT = 24;

// Shared by the Fixed Range Volume Profile drawing and the always-on
// Session (visible-range) Volume Profile — both bucket a set of candles'
// volume into price bins the same way, they just differ in which candles
// they bucket (a user-picked range vs. whatever's currently on screen).
function computeVolumeBins(candles: Candle[], priceLow: number, priceHigh: number, binCount: number) {
  const binHeight = (priceHigh - priceLow) / binCount;
  const bins = new Array(binCount).fill(0);
  for (const c of candles) {
    const span = c.high - c.low;
    if (span <= 0) {
      const idx = Math.min(binCount - 1, Math.max(0, Math.floor((c.close - priceLow) / binHeight)));
      bins[idx] += c.volume;
      continue;
    }
    for (let i = 0; i < binCount; i++) {
      const binLow = priceLow + i * binHeight;
      const binHigh = binLow + binHeight;
      const overlap = Math.min(c.high, binHigh) - Math.max(c.low, binLow);
      if (overlap > 0) bins[i] += c.volume * (overlap / span);
    }
  }
  const maxBinVolume = Math.max(...bins, 1);
  const pocIdx = bins.indexOf(maxBinVolume);
  return { bins, binHeight, maxBinVolume, pocIdx };
}

class DrawingsPaneRenderer implements IPrimitivePaneRenderer {
  constructor(private primitive: DrawingsPrimitive) {}

  draw(target: import("fancy-canvas").CanvasRenderingTarget2D) {
    const chart = this.primitive.chart;
    const series = this.primitive.series;
    if (!chart || !series) return;

    const timeScale = chart.timeScale();
    const toX = (time: number) => timeScale.timeToCoordinate(time as UTCTimestamp);
    const toY = (price: number) => series.priceToCoordinate(price);

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.font = "11px sans-serif";

      const renderOne = (d: Drawing) => {
        if (d.kind === "trendline") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) return;
          ctx.strokeStyle = "#471898";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        } else if (d.kind === "horizontal") {
          const y = toY(d.price);
          if (y === null) return;
          ctx.strokeStyle = "#466fff";
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(mediaSize.width, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#466fff";
          ctx.fillText(d.price.toFixed(2), 4, y - 4);
        } else if (d.kind === "rectangle") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) return;
          ctx.fillStyle = "rgba(71, 24, 152, 0.1)";
          ctx.strokeStyle = "rgba(71, 24, 152, 0.6)";
          const x = Math.min(x1, x2);
          const y = Math.min(y1, y2);
          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        } else if (d.kind === "fibonacci") {
          const x1 = toX(d.from.time);
          const x2 = toX(d.to.time);
          if (x1 === null || x2 === null) return;
          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);
          const priceRange = d.to.price - d.from.price;
          for (const level of FIB_LEVELS) {
            const price = d.from.price + priceRange * level;
            const y = toY(price);
            if (y === null) continue;
            ctx.strokeStyle = "rgba(189, 163, 96, 0.8)";
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.stroke();
            ctx.fillStyle = "#bda360";
            ctx.fillText(`${(level * 100).toFixed(1)}% (${price.toFixed(2)})`, right + 4, y + 3);
          }
        } else if (d.kind === "text") {
          const x = toX(d.at.time);
          const y = toY(d.at.price);
          if (x === null || y === null) return;
          ctx.font = "600 12px sans-serif";
          ctx.fillStyle = "#0e1b2d";
          ctx.fillText(d.text, x + 4, y - 4);
        } else if (d.kind === "ray") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) return;
          // Extend the line from `to` in the from->to direction out to the pane edge.
          const dx = x2 - x1;
          const dy = y2 - y1;
          const t = dx !== 0 ? (dx > 0 ? (mediaSize.width - x1) / dx : (0 - x1) / dx) : 1e6;
          const exX = x1 + dx * t;
          const exY = y1 + dy * t;
          ctx.strokeStyle = "#471898";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(exX, exY);
          ctx.stroke();
        } else if (d.kind === "arrow") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) return;
          ctx.strokeStyle = "#00a83e";
          ctx.fillStyle = "#00a83e";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 9;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        } else if (d.kind === "circle") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) return;
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          const rx = Math.abs(x2 - x1) / 2;
          const ry = Math.abs(y2 - y1) / 2;
          ctx.fillStyle = "rgba(71, 24, 152, 0.1)";
          ctx.strokeStyle = "rgba(71, 24, 152, 0.6)";
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (d.kind === "measure") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) return;
          const up = d.to.price >= d.from.price;
          const fill = up ? "rgba(0, 168, 62, 0.12)" : "rgba(214, 0, 0, 0.12)";
          const stroke = up ? "#00a83e" : "#d60000";
          const x = Math.min(x1, x2);
          const y = Math.min(y1, y2);
          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          ctx.fillStyle = fill;
          ctx.strokeStyle = stroke;
          ctx.setLineDash([4, 3]);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          const priceDelta = d.to.price - d.from.price;
          const pct = d.from.price !== 0 ? (priceDelta / d.from.price) * 100 : 0;
          const label = `${priceDelta >= 0 ? "+" : ""}${priceDelta.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
          ctx.font = "600 12px sans-serif";
          ctx.fillStyle = stroke;
          ctx.fillText(label, x2 + 6, y2 - 6);
        } else if (d.kind === "volumeProfile") {
          const lo = Math.min(d.fromTime, d.toTime);
          const hi = Math.max(d.fromTime, d.toTime);
          const rangeCandles = this.primitive.candles.filter((c) => c.time >= lo && c.time <= hi);
          if (rangeCandles.length === 0) return;

          const priceLow = Math.min(...rangeCandles.map((c) => c.low));
          const priceHigh = Math.max(...rangeCandles.map((c) => c.high));
          if (priceHigh <= priceLow) return;

          const BIN_COUNT = VOLUME_PROFILE_BIN_COUNT;
          const { bins, binHeight, maxBinVolume, pocIdx } = computeVolumeBins(rangeCandles, priceLow, priceHigh, BIN_COUNT);
          const xLeft = toX(lo);
          const xRight = toX(hi);
          if (xLeft === null || xRight === null) return;
          const maxBarWidth = Math.max(24, (xRight - xLeft) * 0.5);

          for (let i = 0; i < BIN_COUNT; i++) {
            if (bins[i] <= 0) continue;
            const binLow = priceLow + i * binHeight;
            const binHigh = binLow + binHeight;
            const yTop = toY(binHigh);
            const yBottom = toY(binLow);
            if (yTop === null || yBottom === null) continue;
            const w = (bins[i] / maxBinVolume) * maxBarWidth;
            ctx.fillStyle = i === pocIdx ? "rgba(214, 0, 0, 0.35)" : "rgba(189, 163, 96, 0.35)";
            ctx.fillRect(xLeft, Math.min(yTop, yBottom), w, Math.max(1, Math.abs(yBottom - yTop) - 1));
          }

          ctx.strokeStyle = "rgba(14, 27, 45, 0.25)";
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(xLeft, 0);
          ctx.lineTo(xLeft, mediaSize.height);
          ctx.moveTo(xRight, 0);
          ctx.lineTo(xRight, mediaSize.height);
          ctx.stroke();
          ctx.setLineDash([]);

          const pocPrice = priceLow + (pocIdx + 0.5) * binHeight;
          const pocY = toY(pocPrice);
          if (pocY !== null) {
            ctx.font = "600 11px sans-serif";
            ctx.fillStyle = "#d60000";
            ctx.fillText(`POC ${pocPrice.toFixed(2)}`, xLeft + 4, pocY - 4);
          }
        } else if (d.kind === "longPosition" || d.kind === "shortPosition") {
          const xLeft = toX(d.entryTime);
          // No draggable right handle (out of scope for now) — the box
          // just runs to the edge of whatever data is currently loaded, the
          // same simplification volumeProfile's rendering already makes.
          const lastCandle = this.primitive.candles.at(-1);
          const xRight = lastCandle ? toX(lastCandle.time) : null;
          const yEntry = toY(d.entryPrice);
          const yStop = toY(d.stopPrice);
          const yTarget = toY(d.targetPrice);
          if (xLeft === null || xRight === null || yEntry === null || yStop === null || yTarget === null) return;

          const risk = Math.abs(d.entryPrice - d.stopPrice);
          const reward = Math.abs(d.targetPrice - d.entryPrice);
          const rr = risk > 0 ? reward / risk : 0;

          // Profit zone (entry -> target) in green, risk zone (entry ->
          // stop) in red — same convention regardless of long/short, since
          // it's always "green toward the target, red toward the stop".
          ctx.fillStyle = "rgba(0, 168, 62, 0.15)";
          ctx.fillRect(xLeft, Math.min(yEntry, yTarget), xRight - xLeft, Math.abs(yTarget - yEntry));
          ctx.fillStyle = "rgba(214, 0, 0, 0.15)";
          ctx.fillRect(xLeft, Math.min(yEntry, yStop), xRight - xLeft, Math.abs(yStop - yEntry));

          ctx.strokeStyle = "#0e1b2d";
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(xLeft, yEntry);
          ctx.lineTo(xRight, yEntry);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.font = "600 11px sans-serif";
          const label = d.kind === "longPosition" ? "LONG" : "SHORT";
          ctx.fillStyle = "#00a83e";
          ctx.fillText(`Target ${d.targetPrice.toFixed(2)}`, xLeft + 4, Math.min(yEntry, yTarget) + 12);
          ctx.fillStyle = "#d60000";
          ctx.fillText(`Stop ${d.stopPrice.toFixed(2)}`, xLeft + 4, Math.max(yEntry, yStop) - 4);
          ctx.fillStyle = "#0e1b2d";
          ctx.fillText(`${label}  Entry ${d.entryPrice.toFixed(2)}  R:R ${rr.toFixed(2)}`, xLeft + 4, yEntry - 4);
        }
      };

      // Session (visible-range) Volume Profile — unlike the Fixed Range
      // one, this isn't a drawing the user placed; it's a live readout of
      // whatever's currently on screen, recomputed every repaint (which
      // already happens on every pan/zoom) rather than stored. Rendered
      // FIRST so it sits under every real drawing — it's meant to read as
      // ambient context, not compete with what the user actually placed.
      if (this.primitive.visibleRangeProfileEnabled) {
        const visible = chart.timeScale().getVisibleRange();
        if (visible) {
          const lo = Number(visible.from);
          const hi = Number(visible.to);
          const rangeCandles = this.primitive.candles.filter((c) => c.time >= lo && c.time <= hi);
          if (rangeCandles.length > 0) {
            const priceLow = Math.min(...rangeCandles.map((c) => c.low));
            const priceHigh = Math.max(...rangeCandles.map((c) => c.high));
            if (priceHigh > priceLow) {
              const { bins, binHeight, maxBinVolume, pocIdx } = computeVolumeBins(rangeCandles, priceLow, priceHigh, VOLUME_PROFILE_BIN_COUNT);
              // Anchored to the right edge of the pane itself (not the data
              // range), matching TradingView's own "Session Volume" style.
              const maxBarWidth = mediaSize.width * 0.15;
              for (let i = 0; i < VOLUME_PROFILE_BIN_COUNT; i++) {
                if (bins[i] <= 0) continue;
                const binLow = priceLow + i * binHeight;
                const binHigh = binLow + binHeight;
                const yTop = toY(binHigh);
                const yBottom = toY(binLow);
                if (yTop === null || yBottom === null) continue;
                const w = (bins[i] / maxBinVolume) * maxBarWidth;
                ctx.fillStyle = i === pocIdx ? "rgba(214, 0, 0, 0.25)" : "rgba(70, 111, 255, 0.18)";
                ctx.fillRect(mediaSize.width - w, Math.min(yTop, yBottom), w, Math.max(1, Math.abs(yBottom - yTop) - 1));
              }
            }
          }
        }
      }

      for (const d of this.primitive.drawings) renderOne(d);

      // The in-progress drawing (between clicks) gets its own pass on top —
      // same shape the real drawing will use, so the chart visibly tracks
      // the cursor instead of appearing to do nothing while a multi-click
      // tool is only partway placed (a real usability gap a user hit live,
      // for Trendline first, then found to also be missing — same failure
      // mode — for Volume Profile and the Long/Short position tool once
      // those were added). Every drawing kind renders here the same way it
      // does when committed; the two-point shapes additionally get endpoint
      // markers and a live length/price readout, since knowing the exact
      // delta while you're still dragging is the whole point of a preview.
      const preview = this.primitive.previewDrawing;
      if (preview) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        renderOne(preview);
        ctx.restore();

        if ("from" in preview && "to" in preview) {
          const x1 = toX(preview.from.time);
          const y1 = toY(preview.from.price);
          const x2 = toX(preview.to.time);
          const y2 = toY(preview.to.price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            ctx.fillStyle = "#0e1b2d";
            ctx.beginPath();
            ctx.arc(x1, y1, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x2, y2, 3, 0, Math.PI * 2);
            ctx.fill();

            const priceDelta = preview.to.price - preview.from.price;
            const pct = preview.from.price !== 0 ? (priceDelta / preview.from.price) * 100 : 0;
            const barsBetween = this.primitive.candles.filter(
              (c) => c.time >= Math.min(preview.from.time, preview.to.time) && c.time <= Math.max(preview.from.time, preview.to.time),
            ).length;
            const label = `${priceDelta >= 0 ? "+" : ""}${priceDelta.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%), ${barsBetween} bars`;
            ctx.font = "600 11px sans-serif";
            const textWidth = ctx.measureText(label).width;
            ctx.fillStyle = "rgba(14, 27, 45, 0.85)";
            ctx.fillRect(x2 + 8, y2 - 20, textWidth + 8, 16);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(label, x2 + 12, y2 - 8);
          }
        }
      }

      ctx.restore();
    });
  }
}

class DrawingsPaneView implements IPrimitivePaneView {
  constructor(private primitive: DrawingsPrimitive) {}
  renderer(): IPrimitivePaneRenderer {
    return new DrawingsPaneRenderer(this.primitive);
  }
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<"Candlestick" | "Line" | "Area" | "Bar"> | null = null;
  drawings: Drawing[] = [];
  // Raw OHLCV for the volume-profile drawing kind, which needs actual
  // candle volume (not just prices) to bucket into its histogram — kept in
  // sync from CandlestickChart's own data-sync effect via setCandles().
  candles: Candle[] = [];
  // The in-progress two-click drawing, if any — set on every mouse move
  // while a point is pending, cleared once the drawing commits or the tool
  // changes. Kept separate from `drawings` so it never gets persisted.
  previewDrawing: Drawing | null = null;
  // Session (visible-range) Volume Profile toggle — see the render comment
  // above for why this is computed live from the pane rather than stored
  // as a drawing.
  visibleRangeProfileEnabled = false;
  private paneView = new DrawingsPaneView(this);
  private requestUpdateFn: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<"Candlestick" | "Line" | "Area" | "Bar">;
    this.requestUpdateFn = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
  }

  setDrawings(drawings: Drawing[]) {
    this.drawings = drawings;
    this.requestUpdateFn?.();
  }

  setCandles(candles: Candle[]) {
    this.candles = candles;
    this.requestUpdateFn?.();
  }

  setPreview(preview: Drawing | null) {
    this.previewDrawing = preview;
    this.requestUpdateFn?.();
  }

  setVisibleRangeProfileEnabled(enabled: boolean) {
    this.visibleRangeProfileEnabled = enabled;
    this.requestUpdateFn?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}
