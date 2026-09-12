"use client";

import type { ComparisonOperator, ConditionNode, Operand, PriceField } from "@/lib/strategy";
import { INDICATOR_CATALOG, INDICATOR_BY_KIND } from "@/lib/strategy/indicator-catalog";
import { CANDLE_PATTERN_CATALOG } from "@/lib/strategy/candle-pattern-catalog";

const PRICE_FIELDS: { value: PriceField; label: string }[] = [
  { value: "CLOSE", label: "Close price" },
  { value: "OPEN", label: "Open price" },
  { value: "HIGH", label: "High price" },
  { value: "LOW", label: "Low price" },
  { value: "VOLUME", label: "Volume" },
];

const OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: "CROSSES_ABOVE", label: "crosses above" },
  { value: "CROSSES_BELOW", label: "crosses below" },
  { value: "GT", label: "is greater than" },
  { value: "LT", label: "is less than" },
  { value: "GTE", label: "is greater than or equal to" },
  { value: "LTE", label: "is less than or equal to" },
  { value: "EQ", label: "equals" },
];

const inputClass =
  "rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary";
const pillButtonClass =
  "rounded-full border px-3 py-1 text-xs font-medium border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary";

function defaultOperand(): Operand {
  return { kind: "price", field: "CLOSE" };
}

function defaultComparison(): ConditionNode {
  return {
    kind: "comparison",
    left: { kind: "indicator", type: "SMA", params: [20] },
    operator: "CROSSES_ABOVE",
    right: { kind: "indicator", type: "EMA", params: [50] },
  };
}

function defaultTimeWindow(): ConditionNode {
  return { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 9 * 60 + 15, endMinute: 9 * 60 + 30 } };
}

function defaultCandlePattern(): ConditionNode {
  return { kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: "BULLISH_ENGULFING" } };
}

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function SignalEditor({
  node,
  onChange,
  onRemove,
}: {
  node: Extract<ConditionNode, { kind: "signal" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
}) {
  const signal = node.signal;

  if (signal.family === "TIME_WINDOW") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-bg p-2">
        <span className="text-xs font-medium text-brand-navy/60">Time is between</span>
        <input
          type="time"
          className={inputClass}
          value={minutesToTimeInput(signal.startMinute)}
          onChange={(e) =>
            onChange({
              kind: "signal",
              signal: { family: "TIME_WINDOW", startMinute: timeInputToMinutes(e.target.value), endMinute: signal.endMinute },
            })
          }
        />
        <span className="text-xs font-medium text-brand-navy/60">and</span>
        <input
          type="time"
          className={inputClass}
          value={minutesToTimeInput(signal.endMinute)}
          onChange={(e) =>
            onChange({
              kind: "signal",
              signal: { family: "TIME_WINDOW", startMinute: signal.startMinute, endMinute: timeInputToMinutes(e.target.value) },
            })
          }
        />
        <span className="text-xs text-brand-navy/40">(IST)</span>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
    );
  }

  if (signal.family === "CANDLE_PATTERN") {
    const grouped: Record<1 | 2 | 3, typeof CANDLE_PATTERN_CATALOG> = { 1: [], 2: [], 3: [] };
    for (const def of CANDLE_PATTERN_CATALOG) grouped[def.candleCount].push(def);
    const groupLabel = { 1: "Single candle", 2: "Double candle", 3: "Triple candle" } as const;

    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-bg p-2">
        <span className="text-xs font-medium text-brand-navy/60">Candle pattern is</span>
        <select
          className={inputClass}
          value={signal.pattern}
          onChange={(e) =>
            onChange({ kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: e.target.value as never } })
          }
        >
          {([1, 2, 3] as const).map((count) => (
            <optgroup key={count} label={groupLabel[count]}>
              {grouped[count].map((def) => (
                <option key={def.kind} value={def.kind}>
                  {def.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
    );
  }

  return null;
}

function OperandEditor({ value, onChange }: { value: Operand; onChange: (v: Operand) => void }) {
  const indicatorDef = value.kind === "indicator" ? INDICATOR_BY_KIND.get(value.type) : undefined;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        className={inputClass}
        value={value.kind === "indicator" ? value.type : value.kind === "price" ? `PRICE:${value.field}` : "CONST"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "CONST") onChange({ kind: "constant", value: 0 });
          else if (v.startsWith("PRICE:")) onChange({ kind: "price", field: v.slice(6) as PriceField });
          else {
            const def = INDICATOR_BY_KIND.get(v as never);
            if (def) onChange({ kind: "indicator", type: def.kind, params: [...def.defaults] });
          }
        }}
      >
        <optgroup label="Indicator">
          {INDICATOR_CATALOG.map((i) => (
            <option key={i.kind} value={i.kind}>
              {i.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Price">
          {PRICE_FIELDS.map((p) => (
            <option key={p.value} value={`PRICE:${p.value}`}>
              {p.label}
            </option>
          ))}
        </optgroup>
        <option value="CONST">Fixed value</option>
      </select>

      {value.kind === "indicator" &&
        indicatorDef?.paramLabels.map((paramLabel, i) => (
          <input
            key={paramLabel + i}
            type="number"
            min={0}
            max={500}
            step="any"
            value={value.params[i]}
            onChange={(e) => {
              const params = value.params.slice();
              params[i] = Number(e.target.value);
              onChange({ ...value, params });
            }}
            className={`${inputClass} w-16`}
            aria-label={paramLabel}
            title={paramLabel}
          />
        ))}

      {value.kind === "constant" && (
        <input
          type="number"
          value={value.value}
          onChange={(e) => onChange({ kind: "constant", value: Number(e.target.value) })}
          className={`${inputClass} w-20`}
          aria-label="Value"
        />
      )}
    </div>
  );
}

function ComparisonEditor({
  node,
  onChange,
  onRemove,
}: {
  node: Extract<ConditionNode, { kind: "comparison" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-bg p-2">
      <OperandEditor value={node.left} onChange={(left) => onChange({ ...node, left })} />
      <select
        className={inputClass}
        value={node.operator}
        onChange={(e) => onChange({ ...node, operator: e.target.value as ComparisonOperator })}
      >
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <OperandEditor value={node.right} onChange={(right) => onChange({ ...node, right })} />
      <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
        Remove
      </button>
    </div>
  );
}

export default function ConditionGroupEditor({
  node,
  onChange,
  depth = 0,
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  depth?: number;
}) {
  if (node.kind === "comparison") {
    return <ComparisonEditor node={node} onChange={onChange} onRemove={() => onChange(defaultComparison())} />;
  }

  if (node.kind === "signal") {
    return <SignalEditor node={node} onChange={onChange} onRemove={() => onChange(defaultComparison())} />;
  }

  if (node.kind === "not") {
    return (
      <div className="rounded-lg border border-dashed border-brand-navy/20 p-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">NOT</p>
        <ConditionGroupEditor node={node.child} onChange={(child) => onChange({ kind: "not", child })} depth={depth + 1} />
      </div>
    );
  }

  const group = node;

  function updateChild(idx: number, child: ConditionNode) {
    const children = group.children.slice();
    children[idx] = child;
    onChange({ ...group, children });
  }

  function removeChild(idx: number) {
    const children = group.children.filter((_, i) => i !== idx);
    onChange({ ...group, children: children.length > 0 ? children : [defaultComparison()] });
  }

  function addCondition() {
    onChange({ ...group, children: [...group.children, defaultComparison()] });
  }

  function addTimeWindow() {
    onChange({ ...group, children: [...group.children, defaultTimeWindow()] });
  }

  function addCandlePattern() {
    onChange({ ...group, children: [...group.children, defaultCandlePattern()] });
  }

  function addGroup() {
    onChange({
      ...group,
      children: [...group.children, { kind: "group", op: "AND", children: [defaultComparison()] }],
    });
  }

  return (
    <div className={depth > 0 ? "rounded-lg border border-dashed border-brand-navy/20 p-2" : ""}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Match</span>
        <div className="flex overflow-hidden rounded-full border border-brand-navy/15">
          {(["AND", "OR"] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => onChange({ ...group, op })}
              className={`px-3 py-1 text-xs font-medium ${
                group.op === op ? "bg-brand-primary text-white" : "text-brand-navy/60 hover:bg-brand-bg"
              }`}
            >
              {op === "AND" ? "all" : "any"}
            </button>
          ))}
        </div>
        <span className="text-xs text-brand-navy/40">of the following</span>
      </div>

      <div className="space-y-2">
        {group.children.map((child, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1">
              {child.kind === "comparison" ? (
                <ComparisonEditor node={child} onChange={(n) => updateChild(idx, n)} onRemove={() => removeChild(idx)} />
              ) : child.kind === "signal" ? (
                <SignalEditor node={child} onChange={(n) => updateChild(idx, n)} onRemove={() => removeChild(idx)} />
              ) : (
                <div className="rounded-lg border border-dashed border-brand-navy/20 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Group</span>
                    <button type="button" onClick={() => removeChild(idx)} className="text-xs text-brand-navy/40 hover:text-brand-sell">
                      Remove group
                    </button>
                  </div>
                  <ConditionGroupEditor node={child} onChange={(n) => updateChild(idx, n)} depth={depth + 1} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={addCondition} className={pillButtonClass}>
          + Condition
        </button>
        <button type="button" onClick={addTimeWindow} className={pillButtonClass}>
          + Time window
        </button>
        <button type="button" onClick={addCandlePattern} className={pillButtonClass}>
          + Candle pattern
        </button>
        {depth < 2 && (
          <button type="button" onClick={addGroup} className={pillButtonClass}>
            + Group
          </button>
        )}
      </div>
    </div>
  );
}

export { defaultComparison, defaultOperand, defaultTimeWindow, defaultCandlePattern };
