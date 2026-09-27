// A slim picture of the NSE trading day (09:15–15:30 IST) with a time rule on
// it: the entry window shaded, or the exit time marked.

const OPEN = 9 * 60 + 15;
const CLOSE = 15 * 60 + 30;
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function TimeWindowStrip({ startMinute, endMinute, kind = "window" }: { startMinute: number; endMinute: number; kind?: "window" | "exit" }) {
  const pct = (m: number) => `${((Math.min(Math.max(m, OPEN), CLOSE) - OPEN) / (CLOSE - OPEN)) * 100}%`;
  const ticks = [OPEN, 10 * 60 + 30, 12 * 60, 13 * 60 + 30, CLOSE];
  return (
    <div className="px-1 pt-1" aria-hidden>
      <div className="relative h-2.5 rounded-full bg-brand-navy/[0.07]">
        {kind === "window" ? (
          <span className="absolute inset-y-0 rounded-full bg-brand-primary/70" style={{ left: pct(startMinute), right: `calc(100% - ${pct(endMinute)})` }} />
        ) : (
          <>
            <span className="absolute inset-y-0 rounded-r-full bg-brand-sell/25" style={{ left: pct(startMinute), right: 0 }} />
            <span className="absolute -top-1 bottom-[-4px] w-0.5 rounded bg-brand-sell" style={{ left: pct(startMinute) }} />
          </>
        )}
      </div>
      <div className="relative mt-1 h-3 text-[9.5px] text-brand-navy/40">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: pct(t) }}>
            {clock(t)}
          </span>
        ))}
      </div>
      <p className="mt-0.5 text-[11px] text-brand-navy/55">
        {kind === "window"
          ? `Orders can fill between ${clock(startMinute)} and ${clock(endMinute)} (IST) — outside the shaded time the rule is false.`
          : `The position is closed at ${clock(startMinute)} (IST), or at the first candle after it.`}
      </p>
    </div>
  );
}
