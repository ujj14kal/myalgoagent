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

export type Drawing =
  | { kind: "trendline"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "horizontal"; price: number }
  | { kind: "rectangle"; from: { time: number; price: number }; to: { time: number; price: number } }
  | { kind: "fibonacci"; from: { time: number; price: number }; to: { time: number; price: number } };

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

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}
