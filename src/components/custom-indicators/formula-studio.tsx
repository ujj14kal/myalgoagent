"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Search, Trash2 } from "lucide-react";
import { saveCustomIndicator } from "@/lib/custom-indicator-actions";
import { ENTRY_OPERATORS, validateCustomDef, type CustomEntry, type CustomIndicatorDef, type EntryOperator } from "@/lib/custom-indicator";
import { FORMULA_REFERENCE, FormulaError, parseProgram } from "@/lib/custom-indicator/formula";
import { estimateCost } from "@/lib/custom-indicator/integrity";
import InspectIndicator from "./inspect";

// Write a custom indicator yourself: the formula as text, or step by step (a name per step, the last line is the indicator),
// with a searchable list of everything the language can do, live checking as you type, a test on real candles and Save.

type Kind = "line" | "overlay" | "signal" | "channel" | "band";
const KINDS: { value: Kind; label: string; about: string }[] = [
  { value: "line", label: "Graph line", about: "A number in its own pane: a ratio, score or oscillator." },
  { value: "overlay", label: "Price overlay", about: "A line drawn on the candles, in price units." },
  { value: "signal", label: "Signal markers", about: "True or false: marks the chart where the formula is true." },
  { value: "channel", label: "Channel", about: "An upper and a lower line (and an optional middle)." },
  { value: "band", label: "Band", about: "A middle line plus and minus a width." },
];
const ENTRY_LABEL: Record<EntryOperator, string> = { CROSSES_ABOVE: "crosses above", CROSSES_BELOW: "crosses below", GT: "is above", LT: "is below" };
const COLORS = ["#6d28d9", "#2563eb", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#db2777", "#475569"];
const EXAMPLE = "fast = ema(close, 5)\nslow = ema(close, 20)\n(fast - slow) / atr(14)";
const ENTRY_NEEDS_NUMBER = (k: Kind) => k === "line" || k === "signal";

type Ref = { group: string; name: string; hint: string; insert: string };
function buildReference(): Ref[] {
  const R = FORMULA_REFERENCE;
  const note = (n: string) => R.notes[n] ?? "";
  const out: Ref[] = [];
  for (const n of R.series) out.push({ group: "Prices and candle shapes", name: n, hint: n === "range" ? "high − low" : n === "body" ? "close − open" : n === "upwick" ? "high above the body" : n === "lowwick" ? "low below the body" : n === "tr" ? "true range" : n === "barindex" ? "candle number" : "price series", insert: n });
  for (const n of R.window) out.push({ group: "Moving windows", name: n, hint: `${n}(source, length)`, insert: n === "change" || n === "ref" || n === "roc" ? `${n}(close, 1)` : `${n}(close, 14)` });
  for (const n of R.math) out.push({ group: "Maths and logic", name: n, hint: note(n) || `${n}(…)`, insert: `${n}(` });
  for (const n of R.statistics) out.push({ group: "Statistics", name: n, hint: note(n), insert: n === "percentile" ? "percentile(close, 50, 80)" : n === "correlation" || n === "covariance" ? `${n}(close, volume, 20)` : `${n}(close, 20)` });
  for (const n of R.memory) out.push({ group: "Memory (what happened before)", name: n, hint: note(n), insert: n === "valuewhen" ? "valuewhen(close > open, close, 0)" : n === "rising" || n === "falling" ? `${n}(close, 3)` : `${n}(close > open)` });
  for (const n of R.swings) out.push({ group: "Swing points (confirmed)", name: n, hint: note(n), insert: `${n}(5)` });
  for (const n of R.clock) out.push({ group: "Clock (IST)", name: n, hint: note(n), insert: `${n}()` });
  out.push({ group: "Bigger candles", name: "htf", hint: note("htf"), insert: "htf(60, ema(close, 20))" });
  for (const i of R.indicators) out.push({ group: "Built-in indicators", name: i.name, hint: `${i.label}${i.settings.length ? ` (${i.settings.join(", ")})` : ""}`, insert: `${i.name}(${i.defaults.join(", ")})` });
  return out;
}

function checkText(text: string): { error: string | null; steps: string[] } {
  if (!text.trim()) return { error: null, steps: [] };
  try {
    return { error: null, steps: parseProgram(text).steps.map((s) => s.name) };
  } catch (e) {
    return { error: e instanceof FormulaError || e instanceof Error ? e.message : "That formula can't be read.", steps: [] };
  }
}

export default function FormulaStudio() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Kind>("line");
  const [text, setText] = useState(EXAMPLE);
  const [upper, setUpper] = useState("highest(high, 20)");
  const [lower, setLower] = useState("lowest(low, 20)");
  const [middle, setMiddle] = useState("");
  const [width, setWidth] = useState("2 * stdev(close, 20)");
  const [view, setView] = useState<"text" | "steps">("text");
  const [color, setColor] = useState(COLORS[0]);
  const [entryOn, setEntryOn] = useState(false);
  const [entryOp, setEntryOp] = useState<EntryOperator>("CROSSES_ABOVE");
  const [entryValue, setEntryValue] = useState("0");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const reference = useMemo(() => buildReference(), []);

  // The field the reference list inserts into: the formula, or the focused channel/band field.
  const [target, setTarget] = useState<"main" | "upper" | "lower" | "middle" | "width">("main");
  const setters = { main: setText, upper: setUpper, lower: setLower, middle: setMiddle, width: setWidth };
  const insert = (snippet: string) => setters[target]((v) => (v.trim() ? `${v.replace(/\s+$/, "")}${v.trim().endsWith("(") ? "" : " "}${snippet}` : snippet));

  const entry: CustomEntry | undefined = entryOn ? { operator: entryOp, ...(ENTRY_NEEDS_NUMBER(kind) && entryValue !== "" ? { value: Number(entryValue) } : {}) } : undefined;
  const look = { color, ...(entry ? { entry } : {}) };
  const def: CustomIndicatorDef =
    kind === "line"
      ? { type: "formula", formula: text, pane: "separate", ...look }
      : kind === "overlay"
        ? { type: "formula", formula: text, pane: "price", ...look }
        : kind === "signal"
          ? { type: "signal", formula: text, ...look }
          : kind === "channel"
            ? { type: "channel", upper, lower, ...(middle.trim() ? { middle } : {}), pane: "price", ...look }
            : { type: "band", middle: text, width, pane: "price", ...look };

  const checks = {
    main: kind === "channel" ? { error: null, steps: [] as string[] } : checkText(text),
    upper: kind === "channel" ? checkText(upper) : { error: null, steps: [] as string[] },
    lower: kind === "channel" ? checkText(lower) : { error: null, steps: [] as string[] },
    width: kind === "band" ? checkText(width) : { error: null, steps: [] as string[] },
  };
  const firstError = checks.main.error ?? checks.upper.error ?? checks.lower.error ?? checks.width.error;
  let cost: ReturnType<typeof estimateCost> | null = null;
  if (!firstError) {
    try {
      cost = estimateCost(validateCustomDef(def));
    } catch {
      cost = null;
    }
  }
  const filtered = reference.filter((r) => !query.trim() || `${r.name} ${r.hint} ${r.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = [...new Set(filtered.map((r) => r.group))];

  // Step view: each line is "name = formula"; the last line is the indicator itself.
  const lines = text.split("\n");
  const setLine = (i: number, v: string) => setText(lines.map((l, j) => (j === i ? v : l)).join("\n"));
  const parts = (l: string) => {
    const m = /^\s*([a-z_][a-z0-9_]*)\s*=(?!=)\s*(.*)$/i.exec(l);
    return m ? { name: m[1], expr: m[2] } : null;
  };

  const save = () =>
    start(async () => {
      const r = await saveCustomIndicator({ name, description, def });
      if (!r.ok) return setError(r.error);
      setError(null);
      setSaved(true);
      router.refresh();
    });

  const field = "w-full rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
  const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45";
  const code = `${field} font-mono`;

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs font-semibold text-brand-primary">
        Write the formula yourself
      </button>
    );

  const formulaBox = (id: "main" | "upper" | "lower" | "middle" | "width", value: string, onChange: (v: string) => void, err: string | null, rows = 2) => (
    <>
      <textarea value={value} rows={rows} spellCheck={false} onFocus={() => setTarget(id)} onChange={(e) => onChange(e.target.value)} className={code} />
      {err && <p className="mt-1 text-xs text-brand-sell">{err}</p>}
    </>
  );

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-navy">Write an indicator yourself</p>
          <p className="text-xs text-brand-navy/50">Only candles that have closed are used, so a value never changes afterwards. Test it on real candles before you save.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-brand-navy/50">
          Close
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Name</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className={label}>What it measures (optional)</span>
          <input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} className={field} />
        </label>
      </div>

      <div>
        <p className={label}>Kind</p>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.value} type="button" aria-pressed={kind === k.value} title={k.about} onClick={() => setKind(k.value)} className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === k.value ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 ring-1 ring-brand-navy/15"}`}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-brand-navy/50">{KINDS.find((k) => k.value === kind)?.about}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {kind === "channel" ? (
            <>
              <div>
                <span className={label}>Upper line</span>
                {formulaBox("upper", upper, setUpper, checks.upper.error, 1)}
              </div>
              <div>
                <span className={label}>Lower line</span>
                {formulaBox("lower", lower, setLower, checks.lower.error, 1)}
              </div>
              <div>
                <span className={label}>Middle line (optional, otherwise halfway)</span>
                {formulaBox("middle", middle, setMiddle, middle.trim() ? checkText(middle).error : null, 1)}
              </div>
            </>
          ) : (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className={`${label} mb-0`}>{kind === "band" ? "Middle line" : kind === "signal" ? "Formula (true / false)" : "Formula"}</span>
                <span className="flex gap-1">
                  {(["text", "steps"] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${view === v ? "bg-brand-navy text-white" : "text-brand-navy/55 ring-1 ring-brand-navy/15"}`}>
                      {v === "text" ? "Write it" : "Step by step"}
                    </button>
                  ))}
                </span>
              </div>
              {view === "text" ? (
                formulaBox("main", text, setText, checks.main.error, 5)
              ) : (
                <div className="space-y-2">
                  {lines.map((l, i) => {
                    const p = parts(l);
                    const last = i === lines.length - 1;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        {!last || p ? (
                          <input value={p?.name ?? ""} placeholder="name" onChange={(e) => setLine(i, `${e.target.value} = ${p?.expr ?? l}`)} className={`${code} w-28 shrink-0`} />
                        ) : (
                          <span className="w-28 shrink-0 text-xs font-semibold text-brand-navy/50">The indicator =</span>
                        )}
                        {!last || p ? <span className="text-brand-navy/40">=</span> : null}
                        <input value={p ? p.expr : l} onFocus={() => setTarget("main")} onChange={(e) => setLine(i, p ? `${p.name} = ${e.target.value}` : e.target.value)} className={code} />
                        {lines.length > 1 && (
                          <button type="button" aria-label="Remove step" onClick={() => setText(lines.filter((_, j) => j !== i).join("\n"))} className="text-brand-navy/35 hover:text-brand-sell">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => setText([...lines.slice(0, -1), `step${lines.length} = close`, lines[lines.length - 1]].join("\n"))} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary">
                    <ListPlus size={13} /> Add a step before the indicator
                  </button>
                  {checks.main.error && <p className="text-xs text-brand-sell">{checks.main.error}</p>}
                </div>
              )}
              {checks.main.steps.length > 0 && <p className="mt-1 text-xs text-brand-navy/50">Steps: {checks.main.steps.join(", ")}. Each one is shown in the test.</p>}
            </div>
          )}
          {kind === "band" && (
            <div>
              <span className={label}>Width (added above and taken below)</span>
              {formulaBox("width", width, setWidth, checks.width.error, 1)}
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm text-brand-navy">
              <input type="checkbox" checked={entryOn} onChange={(e) => setEntryOn(e.target.checked)} />
              Add an entry rule that fills in when this is picked in a strategy
            </label>
            {entryOn && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-brand-navy/60">{ENTRY_NEEDS_NUMBER(kind) ? "Entry when it" : "Entry when price"}</span>
                <select value={entryOp} onChange={(e) => setEntryOp(e.target.value as EntryOperator)} className="rounded-lg border border-brand-navy/15 px-2 py-1 text-sm">
                  {ENTRY_OPERATORS.map((o) => (
                    <option key={o} value={o}>
                      {ENTRY_LABEL[o]}
                    </option>
                  ))}
                </select>
                {ENTRY_NEEDS_NUMBER(kind) ? <input type="number" value={entryValue} onChange={(e) => setEntryValue(e.target.value)} className="w-24 rounded-lg border border-brand-navy/15 px-2 py-1 text-sm" /> : <span className="text-brand-navy/60">it</span>}
              </div>
            )}
          </div>

          <div>
            <p className={label}>Colour</p>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-brand-navy" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>

        <aside className="min-w-0 rounded-xl bg-brand-bg/60 p-3">
          <label className="relative block">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-brand-navy/35" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a function…" className={`${field} pl-7`} />
          </label>
          <p className="mt-2 text-[11px] text-brand-navy/45">Click one to add it to the {target === "main" ? "formula" : `${target} line`}.</p>
          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto pr-1">
            {groups.map((g) => (
              <div key={g}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy/40">{g}</p>
                <ul className="mt-1 space-y-0.5">
                  {filtered
                    .filter((r) => r.group === g)
                    .slice(0, 40)
                    .map((r) => (
                      <li key={`${g}-${r.name}`}>
                        <button type="button" onClick={() => insert(r.insert)} className="block w-full rounded px-1.5 py-1 text-left hover:bg-white">
                          <span className="font-mono text-xs font-semibold text-brand-primary">{r.name}</span>
                          <span className="block text-[11px] leading-snug text-brand-navy/55">{r.hint}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            {groups.length === 0 && <p className="text-xs text-brand-navy/50">Nothing matches.</p>}
          </div>
        </aside>
      </div>

      {cost && <p className="text-xs text-brand-navy/55">{cost.summary}</p>}
      {!firstError && <InspectIndicator def={def} />}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !name.trim() || !!firstError} onClick={save} className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save indicator"}
        </button>
        {error && <p className="text-sm text-brand-sell">{error}</p>}
        {saved && !error && <p className="text-sm text-[#0b6b30]">Saved. It now appears under Custom in every indicator picker.</p>}
      </div>
    </div>
  );
}
