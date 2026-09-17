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
  | { kind: "volumeProfile"; fromTime: number; toTime: number };

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

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

      for (const d of this.primitive.drawings) {
        if (d.kind === "trendline") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
          ctx.strokeStyle = "#471898";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        } else if (d.kind === "horizontal") {
          const y = toY(d.price);
          if (y === null) continue;
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
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
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
          if (x1 === null || x2 === null) continue;
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
          if (x === null || y === null) continue;
          ctx.font = "600 12px sans-serif";
          ctx.fillStyle = "#0e1b2d";
          ctx.fillText(d.text, x + 4, y - 4);
        } else if (d.kind === "ray") {
          const x1 = toX(d.from.time);
          const y1 = toY(d.from.price);
          const x2 = toX(d.to.time);
          const y2 = toY(d.to.price);
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
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
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
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
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
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
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
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
          if (rangeCandles.length === 0) continue;

          const priceLow = Math.min(...rangeCandles.map((c) => c.low));
          const priceHigh = Math.max(...rangeCandles.map((c) => c.high));
          if (priceHigh <= priceLow) continue;

          const BIN_COUNT = 24;
          const binHeight = (priceHigh - priceLow) / BIN_COUNT;
          const bins = new Array(BIN_COUNT).fill(0);
          for (const c of rangeCandles) {
            const span = c.high - c.low;
            if (span <= 0) {
              // Zero-range bar (e.g. a doji with high === low): all its
              // volume belongs to the single bin containing that price.
              const idx = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((c.close - priceLow) / binHeight)));
              bins[idx] += c.volume;
              continue;
            }
            // Distribute each candle's volume across every bin its high-low
            // range overlaps, weighted by the fraction of the candle's own
            // range inside that bin — the standard way a volume profile
            // approximates intrabar volume without tick-level data.
            for (let i = 0; i < BIN_COUNT; i++) {
              const binLow = priceLow + i * binHeight;
              const binHigh = binLow + binHeight;
              const overlap = Math.min(c.high, binHigh) - Math.max(c.low, binLow);
              if (overlap > 0) bins[i] += c.volume * (overlap / span);
            }
          }

          const maxBinVolume = Math.max(...bins, 1);
          const pocIdx = bins.indexOf(maxBinVolume);
          const xLeft = toX(lo);
          const xRight = toX(hi);
          if (xLeft === null || xRight === null) continue;
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

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}
