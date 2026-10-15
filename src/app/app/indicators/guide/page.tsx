import Link from "next/link";
import { BookOpen } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { FORMULA_LIMITS, FORMULA_REFERENCE } from "@/lib/custom-indicator/formula";
import { MAX_DATASET_ROWS } from "@/lib/custom-indicator";

export const metadata = { title: "Indicator language guide", robots: { index: false } };

const EXAMPLES: { title: string; about: string; code: string }[] = [
  { title: "How far price is from its average, in ATRs", about: "A graph line: positive above the 50-day average, negative below.", code: "(close - sma(close, 50)) / atr(14)" },
  { title: "Trend strength with named steps", about: "Each step has a name, shown in Test & inspect. The last line is the indicator.", code: "fast = ema(close, 5)\nslow = ema(close, 20)\n(fast - slow) / atr(14)" },
  { title: "Your own function", about: "Define a calculation once and use it with different inputs.", code: "fn dist(x, n) = (x - sma(x, n)) / atr(14)\ndist(close, 10) - dist(close, 50)" },
  { title: "Smoothing built from its own previous value", about: "self is the value on the candle before.", code: "recur(close, 0.9 * self + 0.1 * close)" },
  { title: "Higher-timeframe filter", about: "Only the last fully closed hourly candle is used, so a value never changes afterwards.", code: "close > htf(60, ema(close, 20)) and rsi(14) > 50" },
  { title: "Break of structure with a volume filter", about: "A signal: true on the candle that closes above the latest confirmed swing high on heavy volume.", code: "bosup(5) and volume > 1.5 * sma(volume, 20)" },
  { title: "Relative strength against the index", about: "Another instrument, lined up with this chart.", code: 'close / sym("^NSEI", close)' },
  { title: "Built from your other indicators", about: "Reads the saved indicator named Trend score (spaces written as _).", code: "ind(trend_score) * 2 + zscore(volume, 20)" },
];

export default function Page() {
  const R = FORMULA_REFERENCE;
  const note = (n: string) => R.notes[n];
  const groups: { title: string; names: string[] }[] = [
    { title: "Prices and candle shapes", names: [...R.series] },
    { title: "Moving windows", names: [...R.window] },
    { title: "Maths and logic", names: [...R.math] },
    { title: "Statistics", names: [...R.statistics] },
    { title: "Memory (what happened before)", names: [...R.memory, ...R.recursion] },
    { title: "Swing points and market structure", names: [...R.swings, ...R.structure] },
    { title: "Statistical estimates", names: [...R.estimates] },
    { title: "The clock (IST)", names: [...R.clock] },
    { title: "Bigger candles", names: [...R.higherTimeframe] },
    { title: "Other data", names: ["ind", "sym", "data"] },
  ];
  const card = "surface p-5";
  return (
    <div className="space-y-6">
      <PageHeader title="Indicator language guide" icon={BookOpen} description="Everything a formula can do, what each part is allowed to see, and the limits. The same language runs on the chart, in the tester, in backtests, forward tests and live strategies." />
      <p>
        <Link href="/app/indicators" className="text-xs font-semibold text-brand-primary hover:underline">
          ← Custom Indicators
        </Link>
      </p>

      <section className={card}>
        <h2 className="text-sm font-semibold text-brand-navy">How it works</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-brand-navy/75">
          <li>A formula is worked out candle by candle on candles that have closed. A value is never revised when later candles arrive: that is what &ldquo;no repainting&rdquo; means, and Test &amp; inspect checks it.</li>
          <li>Several lines make a program: <code>name = formula</code> lines are steps that later lines can use, and the last line is the indicator itself. <code>fn name(a, b) = …</code> defines a calculation you can use again.</li>
          <li>Anything that needs a later candle to be sure (a swing high, a bigger candle) is shown only after it is confirmed. <code>htflive</code> is the one exception: it reads a bigger candle while it forms, and is marked provisional.</li>
          <li>A value is empty (a dash) until there are enough earlier candles for it. It is never made up.</li>
          <li>Statistical estimates (Kalman, Fisher, entropy, dominant cycle, Hurst, EW standard deviation) are model-based readings, not exact counts; they are labelled as estimates wherever they are used.</li>
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-brand-navy">Limits</h2>
        <ul className="mt-2 grid gap-1 text-sm text-brand-navy/75 sm:grid-cols-2">
          <li>Up to {FORMULA_LIMITS.characters.toLocaleString("en-IN")} characters</li>
          <li>Up to {FORMULA_LIMITS.steps} lines, {FORMULA_LIMITS.functions} functions of your own</li>
          <li>Up to {FORMULA_LIMITS.calculations} calculations in one formula</li>
          <li>Windows up to {FORMULA_LIMITS.window.toLocaleString("en-IN")} candles</li>
          <li>Indicators built on others: 3 levels, 8 at once</li>
          <li>Datasets: {MAX_DATASET_ROWS.toLocaleString("en-IN")} rows, 8 per indicator</li>
          <li>Other instruments: 5 per indicator</li>
          <li>100 indicators and 20 datasets per account</li>
        </ul>
        <p className="mt-3 text-xs text-brand-navy/55">Candles here carry open, high, low, close and volume. Open interest, bid and ask, order-book depth, implied volatility and Greeks, market breadth and delivery data aren&apos;t available to formulas, and a formula that asks for them is refused instead of being given invented values. Your own numbers can come in as a dataset.</p>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-brand-navy">Examples</h2>
        <div className="mt-3 space-y-4">
          {EXAMPLES.map((e) => (
            <div key={e.title}>
              <p className="text-sm font-semibold text-brand-navy">{e.title}</p>
              <p className="text-xs text-brand-navy/55">{e.about}</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-brand-bg/70 px-3 py-2 font-mono text-xs text-brand-navy/80">{e.code}</pre>
            </div>
          ))}
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.title} className={card}>
          <h2 className="text-sm font-semibold text-brand-navy">{g.title}</h2>
          <ul className="mt-2 divide-y divide-black/[0.05]">
            {g.names.map((n) => (
              <li key={n} className="flex flex-wrap gap-x-3 py-1.5 text-sm">
                <code className="font-semibold text-brand-primary">{n}</code>
                <span className="min-w-0 flex-1 text-brand-navy/65">{note(n) ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className={card}>
        <h2 className="text-sm font-semibold text-brand-navy">The built-in indicators you can call by name</h2>
        <p className="mt-1 text-xs text-brand-navy/50">Write the name with its settings, for example atr(14) or supertrend(10, 3).</p>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {R.indicators.map((i) => (
            <li key={i.name} className="flex flex-wrap gap-x-2">
              <code className="font-semibold text-brand-primary">{i.name}</code>
              <span className="text-brand-navy/60">
                {i.label}
                {i.settings.length ? ` (${i.settings.join(", ")})` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
