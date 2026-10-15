import { describe, expect, it } from "vitest";
import { evaluateFormula, FormulaError, parseFormula, parseProgram } from "./formula";

const candles = Array.from({ length: 60 }, (_, i) => {
  const close = 100 + Math.sin(i / 5) * 10 + i * 0.5;
  return { time: 1_700_000_000 + i * 86400, open: close - 1, high: close + 2, low: close - 2, close, volume: 1000 + i };
});
const at = (formula: string, i: number) => evaluateFormula(parseFormula(formula), candles)[i];

describe("formula parsing", () => {
  it("parses arithmetic, precedence and functions", () => {
    expect(at("1 + 2 * 3", 0)).toBe(7);
    expect(at("(1 + 2) * 3", 0)).toBe(9);
    expect(at("-2 ^ 2", 0)).toBe(-4);
    expect(at("close - open", 5)).toBeCloseTo(1);
    expect(at("hl2", 3)).toBeCloseTo(candles[3].close);
  });
  it("gives plain-English errors", () => {
    for (const [f, msg] of [
      ["", /Write a formula/],
      ["close +", /ends too early/],
      ["sma(close)", /source and a length/],
      ["sma(close, 0)", /whole number/],
      ["foo(close)", /no function called foo/],
      ["price", /Unknown name "price"/],
      ["close $ 2", /isn't allowed/],
      ["close; drop", /sets nothing/],
      ["(close", /closing/],
    ] as const)
      expect(() => parseFormula(f)).toThrow(msg);
    expect(() => parseFormula("x".repeat(600))).toThrow(FormulaError);
  });
});

describe("formula values", () => {
  it("windows are undefined until they have enough bars, then match a hand calculation", () => {
    const v = evaluateFormula(parseFormula("sma(close, 3)"), candles);
    expect(v[1]).toBeNaN();
    expect(v[2]).toBeCloseTo((candles[0].close + candles[1].close + candles[2].close) / 3);
    expect(at("highest(high, 5)", 10)).toBe(Math.max(...candles.slice(6, 11).map((c) => c.high)));
    expect(at("ref(close, 2)", 10)).toBe(candles[8].close);
    expect(at("change(close)", 10)).toBeCloseTo(candles[10].close - candles[9].close);
  });
  it("uses built-in indicators by name and combines them", () => {
    const v = at("(ema(close, 5) - ema(close, 20)) / atr(14)", 40);
    expect(Number.isFinite(v)).toBe(true);
    expect(at("rsi(14)", 40)).toBeCloseTo(at("rsi(close, 14)", 40), 1);
  });
  it("comparisons and if() produce 1/0 and choices", () => {
    expect(at("close > open", 5)).toBe(1);
    expect(at("if(close > open, 10, 20)", 5)).toBe(10);
    expect(at("close > open and volume > 5000", 5)).toBe(0);
  });
});

// A longer intraday series (3 sessions of 5-minute candles) so the clock and higher-timeframe functions have something to work on.
const IST = 19_800;
const intraday = Array.from({ length: 3 * 75 }, (_, i) => {
  const day = Math.floor(i / 75);
  const slot = i % 75;
  const t = Date.parse("2026-03-09T00:00:00Z") / 1000 - IST + day * 86400 + (555 + slot * 5) * 60;
  const close = 100 + Math.sin(i / 7) * 6 + i * 0.05;
  return { time: t, open: close - 0.4, high: close + 1.2, low: close - 1.1, close, volume: 500 + (i % 9) * 40 };
});
const run = (f: string, c = intraday) => evaluateFormula(parseFormula(f), c);

describe("steps (named formulas)", () => {
  it("lets later lines use earlier names", () => {
    const v = run("fast = ema(close, 5)\nslow = ema(close, 20)\n(fast - slow) / atr(14)");
    expect(v.at(-1)).toBeCloseTo(run("(ema(close, 5) - ema(close, 20)) / atr(14)").at(-1)!);
    const prog = parseProgram("a = close - open; b = a * 2; b + 1");
    expect(prog.steps.map((x) => x.name)).toEqual(["a", "b"]);
  });
  it("explains mistakes in plain English", () => {
    expect(() => parseProgram("a = close")).toThrow(/last line must be the indicator/);
    expect(() => parseProgram("close = 3; close")).toThrow(/already a name/);
    expect(() => parseProgram("a = 1; a = 2; a")).toThrow(/set twice/);
    expect(() => parseProgram("x + 1")).toThrow(/Unknown name "x"/);
  });
  it("refuses a formula that grows out of control", () => {
    const lines = ["v0 = close", ...Array.from({ length: 28 }, (_, i) => `v${i + 1} = v${i} + v${i}`), "v28 + 1"];
    expect(() => parseProgram(lines.join("\n"))).toThrow(/too much work/);
  });
});

describe("new functions", () => {
  it("statistics match hand calculations", () => {
    const w = intraday.slice(30, 40).map((c) => c.close);
    const mean = w.reduce((a, b) => a + b, 0) / 10;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / 10);
    expect(run("zscore(close, 10)")[39]).toBeCloseTo((w[9] - mean) / sd);
    expect(run("variance(close, 10)")[39]).toBeCloseTo(sd ** 2);
    const sorted = [...w].sort((a, b) => a - b);
    expect(run("median(close, 10)")[39]).toBeCloseTo((sorted[4] + sorted[5]) / 2);
    expect(run("percentrank(close, 10)")[39]).toBeCloseTo((w.filter((v) => v <= w[9]).length / 10) * 100);
    expect(run("normalize(close, 10)")[39]).toBeCloseTo((w[9] - Math.min(...w)) / (Math.max(...w) - Math.min(...w)));
  });
  it("regression gives an exact slope on a straight line and correlation of 1 with itself", () => {
    const line = intraday.map((c, i) => ({ ...c, close: 50 + 2 * i }));
    expect(run("slope(close, 10)", line)[40]).toBeCloseTo(2);
    expect(run("linreg(close, 10)", line)[40]).toBeCloseTo(line[40].close);
    expect(run("correlation(close, close, 10)")[40]).toBeCloseTo(1);
  });
  it("math helpers", () => {
    expect(run("clamp(close, 100, 101)").every((v) => v >= 100 && v <= 101)).toBe(true);
    expect(run("pow(2, 3) + mod(7, 4) + floor(2.9) + sign(-5)")[0]).toBe(8 + 3 + 2 - 1);
    expect(run("nz(ref(close, 3), 7)")[1]).toBe(7);
    expect(run("isna(ref(close, 3))")[1]).toBe(1);
  });
  it("memory functions", () => {
    const v = run("barssince(close > ref(close))");
    expect(v.slice(1).every((x) => Number.isFinite(x) || x !== x)).toBe(true);
    const up = run("streak(close > open)");
    expect(up[10]).toBeGreaterThanOrEqual(0);
    expect(run("cum(1)")[9]).toBe(10);
    const vw = run("valuewhen(close > open, close, 0)");
    const first = intraday.findIndex((c) => c.close > c.open);
    expect(vw[first]).toBe(intraday[first].close);
    expect(run("rising(close, 2)")[3]).toBe(+(intraday[3].close > intraday[2].close && intraday[2].close > intraday[1].close));
  });
  it("candle geometry and clock", () => {
    expect(run("range")[5]).toBeCloseTo(intraday[5].high - intraday[5].low);
    expect(run("body")[5]).toBeCloseTo(0.4);
    expect(run("minuteofday()")[0]).toBe(555);
    expect(run("hour()")[0]).toBe(9);
    expect(run("dayofweek()")[0]).toBe(1);
    expect(run("barindex")[7]).toBe(7);
  });
  it("pivots are confirmed after their right-hand bars and never move", () => {
    const k = 3;
    const v = run(`pivothigh(${k})`);
    const first = v.findIndex((x) => Number.isFinite(x));
    expect(first).toBeGreaterThanOrEqual(2 * k);
    expect(v[first]).toBe(intraday[first - k].high);
    const held = run(`swinghigh(${k})`);
    expect(held[first]).toBe(v[first]);
    expect(held[first + 1]).toBe(v[first]); // held until the next one
  });
});

describe("higher timeframe", () => {
  it("shows a bigger candle only after it has closed", () => {
    const v = run("htf(60, close)");
    // Day 1's first hour is bars 0..11 on 5-minute candles; during it there is no previous hour yet.
    expect(v[0]).toBeNaN();
    expect(v[11]).toBeNaN();
    // Bar 12 starts the second hour: it shows the first hour's close (bar 11's close).
    expect(v[12]).toBeCloseTo(intraday[11].close);
    expect(v[23]).toBeCloseTo(intraday[11].close);
    expect(v[24]).toBeCloseTo(intraday[23].close);
  });
  it("works for daily candles and for indicators on them", () => {
    const d = run("htf(1440, close)");
    expect(d[74]).toBeNaN();
    expect(d[75]).toBeCloseTo(intraday[74].close);
    expect(Number.isFinite(run("htf(60, ema(close, 3))").at(-1)!)).toBe(true);
  });
  it("rejects unsupported sizes and nesting", () => {
    expect(() => parseFormula("htf(7, close)")).toThrow(/candle size must be one of/);
    expect(() => parseFormula("htf(60, htf(15, close))")).toThrow(/inside another htf/);
  });
});

describe("no look-ahead: a value never changes when later candles arrive", () => {
  const formulas = [
    "zscore(close, 20)", "median(close, 9)", "linreg(close, 12)", "slope(close, 12)", "percentrank(close, 15)", "normalize(close, 10)", "skew(close, 20)",
    "correlation(close, volume, 15)", "percentile(close, 20, 80)", "barssince(close > open)", "streak(close > open)", "cum(volume)", "valuewhen(close > open, close, 1)",
    "rising(close, 3)", "recur(close, 0.9 * self + 0.1 * close)", "kalman(close, 0.01, 1)", "fisher(close, 10)", "entropy(close, 20, 6)", "dominantcycle(close, 32)", "hurst(close, 30)", "ewmstd(close, 10)", "htflive(30, close)", "htflive(60, ema(close, 3))", "pivothigh(3)", "pivotlow(3)", "swinghigh(4)", "swinglow(4)", "htf(15, close)", "htf(60, ema(close, 3))", "htf(1440, close)", "tr", "minuteofday()",
    "fvgbull()", "fvgbear()", "fvgbullmid()", "fvgbearmid()", "eqhigh(10, 0.2)", "eqlow(10, 0.2)", "sweephigh(10)", "sweeplow(10)", "bosup(3)", "bosdown(3)", "obbullhigh(3)", "obbulllow(3)", "obbearhigh(3)", "obbearlow(3)",
    "a = zscore(close, 10)\nb = htf(30, sma(close, 3))\na - b",
  ];
  it.each(formulas)("%s", (f) => {
    const full = run(f);
    for (const cut of [40, 80, 130, 200]) {
      const part = run(f, intraday.slice(0, cut));
      for (let i = 0; i < cut; i++) {
        if (Number.isNaN(full[i])) expect(part[i]).toBeNaN();
        else expect(part[i]).toBeCloseTo(full[i], 8);
      }
    }
  });
});

describe("market structure", () => {
  const bar = (i: number, o: number, h: number, l: number, c: number) => ({ time: 1_700_000_000 + i * 300, open: o, high: h, low: l, close: c, volume: 100 });
  it("marks a bullish fair value gap on the candle that completes it", () => {
    const cs = [bar(0, 10, 11, 9, 10), bar(1, 10, 14, 10, 13), bar(2, 13, 15, 12, 14)]; // candle 2's low (12) is above candle 0's high (11)
    expect(run("fvgbull()", cs)).toEqual([NaN, NaN, 1]);
    expect(run("fvgbear()", cs)[2]).toBe(0);
    expect(run("fvgbullmid()", cs)[2]).toBeCloseTo(11.5);
  });
  it("forgets the gap once price closes through it", () => {
    const cs = [bar(0, 10, 11, 9, 10), bar(1, 10, 14, 10, 13), bar(2, 13, 15, 12, 14), bar(3, 14, 14, 10, 10.5)];
    expect(run("fvgbullmid()", cs)[3]).toBeNaN(); // closed below the gap's bottom (11)
  });
  it("sees equal highs and a liquidity sweep", () => {
    const cs = [bar(0, 10, 20, 9, 11), bar(1, 11, 19, 10, 12), bar(2, 12, 20.01, 11, 12)];
    expect(run("eqhigh(2, 0.1)", cs)[2]).toBe(1);
    const sweep = [...cs.slice(0, 2), bar(2, 12, 21, 11, 18)]; // went above 20 and came back under it
    expect(run("sweephigh(2)", sweep)[2]).toBe(1);
    expect(run("sweephigh(2)", [...cs.slice(0, 2), bar(2, 12, 21, 11, 22)])[2]).toBe(0); // it closed above: a breakout, not a sweep
  });
  it("calls a break of structure when a close passes the latest confirmed swing high", () => {
    const px = [10, 11, 12, 13, 12, 11, 10, 11, 12, 13.5, 15]; // swing high 13 at index 3, confirmed at index 6 (k = 3)
    const cs = px.map((c, i) => bar(i, c, c + 0.2, c - 0.2, c));
    const v = run("bosup(3)", cs);
    expect(v[9]).toBe(1); // 13.5 closes above the swing high of 13.2
    expect(v[8]).toBe(0);
  });
  it("keeps an order block until price closes through it", () => {
    const px = [10, 11, 12, 13, 12, 11, 10, 11, 12, 13.5, 15, 9];
    const cs = px.map((c, i) => bar(i, i === 8 ? 12.4 : c - 0.1, c + 0.2, c - 0.2, i === 8 ? 11.8 : c));
    const hi = run("obbullhigh(3)", cs);
    expect(Number.isFinite(hi[9])).toBe(true);
    expect(hi[11]).toBeNaN(); // closing at 9 is below the block, so it is gone
  });
});

describe("your own functions", () => {
  it("defines a calculation once and uses it with different inputs", () => {
    const v = run("fn dist(x, n) = (x - sma(x, n)) / atr(14)\ndist(close, 10) - dist(close, 30)");
    const direct = run("(close - sma(close, 10)) / atr(14) - (close - sma(close, 30)) / atr(14)");
    expect(v.at(-1)).toBeCloseTo(direct.at(-1)!);
  });
  it("lets an input be a window length", () => {
    expect(run("fn avg(n) = sma(close, n)\navg(5)").at(-1)).toBeCloseTo(run("sma(close, 5)").at(-1)!);
    expect(() => parseFormula("fn avg(n) = sma(close, n)\navg(close)")).toThrow(/whole number/);
  });
  it("can use functions defined before it", () => {
    expect(run("fn sq(x) = x * x\nfn hyp(a, b) = sqrt(sq(a) + sq(b))\nhyp(3, 4)")[0]).toBe(5);
  });
  it("explains mistakes", () => {
    expect(() => parseFormula("fn f(x) = x\nf(1, 2)")).toThrow(/takes 1 value/);
    expect(() => parseFormula("fn sma(x) = x\n1")).toThrow(/already a name/);
    expect(() => parseFormula("fn f(x, x) = x\n1")).toThrow(/different names/);
    expect(() => parseFormula("fn f(x) = x")).toThrow(/last line/);
    expect(() => parseFormula("fn f(x) = y\n1")).toThrow(/Unknown name "y"/);
  });
  it("never repaints", () => {
    const f = "fn z(x, n) = zscore(x, n)\nz(close, 15) + htf(60, z(close, 5))";
    const full = run(f);
    const part = run(f, intraday.slice(0, 120));
    for (let i = 0; i < 120; i++) {
      if (Number.isNaN(full[i])) expect(part[i]).toBeNaN();
      else expect(part[i]).toBeCloseTo(full[i], 9);
    }
  });
});

describe("data that isn't there", () => {
  it("says so instead of inventing values", () => {
    expect(() => parseFormula("openinterest > 100")).toThrow(/isn't available to indicators/);
    expect(() => parseFormula("bid - ask")).toThrow(/never given invented values/);
    expect(() => parseFormula("iv * 2")).toThrow(/implied volatility/);
  });
  it("says why another instrument can't be read", () => {
    expect(() => parseFormula("sym(close)")).toThrow(/another instrument/);
    expect(() => parseFormula("foo(close)")).toThrow(/no function called foo/);
  });
});

describe("own previous value and estimators", () => {
  it("recur builds a value from its previous one", () => {
    const v = run("recur(close, 0.9 * self + 0.1 * close)");
    let want = intraday[0].close;
    for (let i = 1; i < 20; i++) want = 0.9 * want + 0.1 * intraday[i].close;
    expect(v[19]).toBeCloseTo(want);
    expect(run("recur(0, self + 1)")[9]).toBe(9);
    expect(run("recur(1, if(self > 100, 1, self * 2))")[10]).toBe(4); // 1, 2, 4 … 128, then back to 1, 2, 4
  });
  it("recur only lets self meet simple arithmetic", () => {
    expect(() => run("recur(close, sma(self, 3))")).toThrow(/self can only be combined/);
    expect(() => parseFormula("self + 1")).toThrow(/Unknown name "self"/);
  });
  it("kalman follows a steady series and smooths noise", () => {
    expect(run("kalman(close, 0.01, 1)").at(-1)).toBeCloseTo(intraday.at(-1)!.close, -1);
    const noisy = intraday.map((c, i) => ({ ...c, close: 100 + (i % 2 ? 3 : -3) }));
    const k = run("kalman(close, 0.01, 1)", noisy);
    expect(Math.abs(k.at(-1)! - 100)).toBeLessThan(3);
  });
  it("entropy is 0 to 1 and a sine has a dominant cycle of its period", () => {
    const e = run("entropy(close, 30, 8)").filter(Number.isFinite);
    expect(e.every((x) => x >= 0 && x <= 1)).toBe(true);
    const sine = intraday.map((c, i) => ({ ...c, close: 100 + 5 * Math.sin((2 * Math.PI * i) / 16) }));
    expect(run("dominantcycle(close, 64)", sine).at(-1)).toBeCloseTo(16, 0);
  });
  it("fisher, hurst and ewmstd give finite readings", () => {
    for (const f of ["fisher(close, 10)", "hurst(close, 40)", "ewmstd(close, 10)"]) expect(Number.isFinite(run(f).at(-1)!)).toBe(true);
  });
});

describe("live bigger candle (provisional)", () => {
  it("shows the forming candle and agrees with htf once it has closed", () => {
    const live = run("htflive(60, close)");
    const closed = run("htf(60, close)");
    expect(live[0]).toBeCloseTo(intraday[0].close); // the first candle of the hour so far
    expect(live[5]).toBeCloseTo(intraday[5].close); // the hour so far ends at this candle
    expect(live[11]).toBeCloseTo(closed[12]); // the hour's last candle = what htf shows after it closed
  });
  it("is flagged as provisional", async () => {
    const { timingNotes } = await import("./integrity");
    expect(timingNotes({ type: "formula", formula: "htflive(60, close)", pane: "separate" }).join(" ")).toMatch(/provisional/);
  });
});
