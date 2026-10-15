"use client";

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { compileGraph, newBlock, PRICES, specOf, SPECS, wouldLoop, type Block, type BlockSpec, type BlockType } from "@/lib/custom-indicator/graph";

// Build an indicator by wiring blocks: pick blocks from the list, drag them around, click a block's right-hand dot and then an input dot
// to connect them. The formula underneath is shown as you go, and "Use this formula" hands it to the editor to test and save.

const W = 200;
const HEAD = 30;
const ROW = 26;
const CANVAS_W = 1100;
const CANVAS_H = 560;

const CATEGORY: Record<BlockType, string> = { price: "Prices", number: "Numbers", window: "Functions of a series", indicator: "Indicators and market structure", math: "Maths", compare: "Comparisons", logic: "Logic", output: "Output" };
const CATEGORY_ORDER: BlockType[] = ["price", "number", "window", "indicator", "math", "compare", "logic"];

const inY = (b: Block, k: number) => b.y + HEAD + k * ROW + ROW / 2;
const outY = (b: Block) => b.y + HEAD / 2;

function starter(): Block[] {
  return [
    { ...newBlock("price", "close", 40, 60, "b1") },
    { ...newBlock("window", "ema", 290, 40, "b2"), inputs: ["b1"], nums: [20] },
    { ...newBlock("math", "-", 540, 70, "b3"), inputs: ["b1", "b2"] },
    { ...newBlock("output", "output", 800, 80, "b4"), inputs: ["b3"] },
  ];
}

export default function BlockBuilder({ onUse }: { onUse: (formula: string) => void }) {
  const [blocks, setBlocks] = useState<Block[]>(starter);
  const [from, setFrom] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const counter = useRef(10);
  const canvas = useRef<HTMLDivElement>(null);

  const compiled = useMemo(() => compileGraph(blocks), [blocks]);
  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const patch = (id: string, f: (b: Block) => Block) => setBlocks((bs) => bs.map((b) => (b.id === id ? f(b) : b)));

  const add = (type: BlockType, op: string) => {
    const n = blocks.length;
    const x = 30 + (n % 4) * 250;
    const y = 30 + Math.floor(n / 4) * 150 + (n % 2) * 30;
    setBlocks((bs) => [...bs, newBlock(type, op, Math.min(x, CANVAS_W - W - 10), Math.min(y, CANVAS_H - 120), `b${++counter.current}`)]);
  };
  const remove = (id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id).map((b) => ({ ...b, inputs: b.inputs.map((i) => (i === id ? null : i)) })));
    if (from === id) setFrom(null);
  };
  const connect = (into: string, k: number) => {
    if (!from) {
      patch(into, (b) => ({ ...b, inputs: b.inputs.map((x, j) => (j === k ? null : x)) })); // clicking a wired input unplugs it
      return;
    }
    if (wouldLoop(blocks, from, into)) {
      setNote("That would make the blocks loop back on themselves.");
      setFrom(null);
      return;
    }
    setNote(null);
    patch(into, (b) => ({ ...b, inputs: b.inputs.map((x, j) => (j === k ? from : x)) }));
    setFrom(null);
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((type) => ({
      type,
      // All the prices are one block (a choice inside it), so the list stays short.
      items: (type === "price" ? ([["close", { ...SPECS.price.close, label: "Price (open, high, low, close, volume…)" }]] as [string, BlockSpec][]) : Object.entries(SPECS[type])).filter(([op, s]) => !q || `${op} ${s.label} ${s.hint}`.toLowerCase().includes(q)),
    })).filter((g) => g.items.length);
  }, [query]);

  const errId = compiled.ok ? null : (compiled.blockId ?? null);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <aside className="min-w-0 rounded-xl bg-brand-bg/60 p-3">
          <label className="relative block">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-brand-navy/35" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a block…" className="w-full rounded-lg border border-brand-navy/15 py-1.5 pl-7 pr-2 text-sm outline-none focus:border-brand-primary" />
          </label>
          <p className="mt-2 text-[11px] text-brand-navy/45">Click a block to add it to the canvas.</p>
          <div className="mt-2 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
            {list.map((g) => (
              <div key={g.type}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy/40">{CATEGORY[g.type]}</p>
                <ul className="mt-1 space-y-0.5">
                  {g.items.map(([op, s]) => (
                    <li key={op}>
                      <button type="button" onClick={() => add(g.type, op)} className="block w-full rounded px-1.5 py-1 text-left hover:bg-white" title={s.hint}>
                        <span className="text-xs font-semibold text-brand-navy">{s.label}</span>
                        <span className="block text-[11px] leading-snug text-brand-navy/50">{s.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 overflow-auto rounded-xl border border-black/[0.08] bg-[radial-gradient(circle,#d9dce6_1px,transparent_1px)] [background-size:18px_18px]">
          <div
            ref={canvas}
            className="relative"
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || !canvas.current) return;
              const r = canvas.current.getBoundingClientRect();
              const x = Math.max(0, Math.min(CANVAS_W - W, e.clientX - r.left - d.dx));
              const y = Math.max(0, Math.min(CANVAS_H - 60, e.clientY - r.top - d.dy));
              patch(d.id, (b) => ({ ...b, x, y }));
            }}
            onPointerUp={() => (drag.current = null)}
            onClick={(e) => e.target === e.currentTarget && setFrom(null)}
          >
            <svg className="pointer-events-none absolute inset-0" width={CANVAS_W} height={CANVAS_H}>
              {blocks.flatMap((b) =>
                b.inputs.map((src, k) => {
                  const s = src ? byId.get(src) : null;
                  if (!s) return null;
                  const x1 = s.x + W;
                  const y1 = outY(s);
                  const x2 = b.x;
                  const y2 = inY(b, k);
                  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
                  return <path key={`${b.id}-${k}`} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} fill="none" stroke="#6d28d9" strokeWidth={2} opacity={0.7} />;
                }),
              )}
            </svg>

            {blocks.map((b) => {
              const spec = specOf(b);
              if (!spec) return null;
              const isOut = b.type === "output";
              return (
                <div
                  key={b.id}
                  className={`absolute rounded-xl border bg-white shadow-sm ${errId === b.id ? "border-brand-sell ring-2 ring-brand-sell/30" : isOut ? "border-brand-primary" : "border-black/10"}`}
                  style={{ left: b.x, top: b.y, width: W }}
                >
                  <div
                    className={`flex cursor-grab items-center justify-between rounded-t-xl px-2.5 active:cursor-grabbing ${isOut ? "bg-brand-primary text-white" : "bg-brand-navy/[0.05] text-brand-navy"}`}
                    style={{ height: HEAD }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const r = canvas.current!.getBoundingClientRect();
                      drag.current = { id: b.id, dx: e.clientX - r.left - b.x, dy: e.clientY - r.top - b.y };
                    }}
                  >
                    <span className="truncate text-xs font-semibold">{b.type === "price" ? "Price" : spec.label}</span>
                    {!isOut && (
                      <button type="button" aria-label="Remove block" onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(b.id)} className="opacity-50 hover:opacity-100">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {b.type === "price" && (
                    <div className="px-2.5 py-1.5">
                      <select value={b.op} onChange={(e) => patch(b.id, (x) => ({ ...x, op: e.target.value }))} className="w-full rounded border border-brand-navy/15 px-1.5 py-1 text-xs">
                        {PRICES.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {spec.inputs.map((label, k) => (
                    <div key={label + k} className="relative flex items-center px-2.5 text-[11px] text-brand-navy/60" style={{ height: ROW }}>
                      <button
                        type="button"
                        aria-label={`Connect to ${label}`}
                        onClick={() => connect(b.id, k)}
                        className={`absolute -left-1.5 h-3 w-3 rounded-full border-2 ${b.inputs[k] ? "border-brand-primary bg-brand-primary" : from ? "animate-pulse border-brand-primary bg-white" : "border-brand-navy/30 bg-white"}`}
                      />
                      <span className="ml-2">{label}</span>
                    </div>
                  ))}
                  {spec.params.map((p, k) => (
                    <label key={p.label} className="flex items-center justify-between gap-2 px-2.5 py-1 text-[11px] text-brand-navy/60">
                      <span className="truncate">{p.label}</span>
                      <input
                        type="number"
                        step="any"
                        value={b.nums[k] ?? p.def}
                        onChange={(e) => patch(b.id, (x) => ({ ...x, nums: x.nums.map((n, j) => (j === k ? Number(e.target.value) : n)) }))}
                        className="w-20 rounded border border-brand-navy/15 px-1.5 py-0.5 text-right text-xs"
                      />
                    </label>
                  ))}
                  {!isOut && (
                    <button
                      type="button"
                      aria-label="Take the value from this block"
                      onClick={() => setFrom(from === b.id ? null : b.id)}
                      className={`absolute -right-1.5 h-3 w-3 rounded-full border-2 ${from === b.id ? "border-brand-primary bg-brand-primary" : "border-brand-navy/30 bg-white hover:border-brand-primary"}`}
                      style={{ top: HEAD / 2 - 6 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {note && <p className="text-xs text-brand-sell">{note}</p>}
      {from && <p className="text-xs text-brand-primary">Now click the input dot on the block that should use it.</p>}
      <div className="rounded-xl bg-brand-bg/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">The formula these blocks make</p>
        {compiled.ok ? (
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-brand-navy/80">{compiled.formula}</pre>
        ) : (
          <p className="mt-1 text-xs text-brand-sell">{compiled.error}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!compiled.ok} onClick={() => compiled.ok && onUse(compiled.formula)} className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          Use this formula
        </button>
        <button type="button" onClick={() => setBlocks(starter())} className="text-xs font-semibold text-brand-navy/50 hover:text-brand-primary">
          Start again
        </button>
        <p className="text-[11px] text-brand-navy/45">The formula then opens in the editor, where you can test it on real candles and save it. Blocks are one way in: edits made in the editor don&apos;t flow back to the blocks.</p>
      </div>
    </div>
  );
}
