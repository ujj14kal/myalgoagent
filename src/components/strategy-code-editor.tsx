"use client";

import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { parseDsl, DslSyntaxError } from "@/lib/strategy";

const CHEATSHEET = [
  { syntax: "sma(20)", desc: "Simple moving average, 20-period" },
  { syntax: "ema(50)", desc: "Exponential moving average, 50-period" },
  { syntax: "rsi(14)", desc: "Relative Strength Index, 14-period" },
  { syntax: "close / open / high / low / volume", desc: "Raw price/volume of the current bar" },
  { syntax: "a > b, a < b, a >= b, a <= b, a == b", desc: "Threshold comparisons" },
  { syntax: "a crossesAbove b, a crossesBelow b", desc: "Crossover detection" },
  { syntax: "and, or, not, ( )", desc: "Combine conditions" },
];

export default function StrategyCodeEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [showHelp, setShowHelp] = useState(false);

  const error = useMemo(() => {
    if (!value.trim()) return null;
    try {
      parseDsl(value);
      return null;
    } catch (err) {
      if (err instanceof DslSyntaxError) return err;
      return err instanceof Error ? err.message : "Invalid expression";
    }
  }, [value]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">{label}</label>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="text-xs text-brand-primary hover:underline"
        >
          {showHelp ? "Hide" : "Show"} syntax reference
        </button>
      </div>

      {showHelp && (
        <div className="mb-2 rounded-lg border border-black/5 bg-brand-bg p-3 text-xs">
          <table className="w-full">
            <tbody>
              {CHEATSHEET.map((row) => (
                <tr key={row.syntax}>
                  <td className="whitespace-nowrap pr-3 py-0.5 font-mono text-brand-primary">{row.syntax}</td>
                  <td className="py-0.5 text-brand-navy/60">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`overflow-hidden rounded-lg border ${error ? "border-brand-sell" : "border-brand-navy/15"}`}>
        <CodeMirror
          value={value}
          height="120px"
          basicSetup={{ lineNumbers: true, foldGutter: false }}
          extensions={[javascript()]}
          onChange={onChange}
          placeholder="e.g. sma(20) crossesAbove ema(50) and rsi(14) < 70"
        />
      </div>

      {error && (
        <p className="mt-1 text-xs text-brand-sell">
          {typeof error === "string" ? error : `Line ${error.line}, column ${error.column}: ${error.message}`}
        </p>
      )}
    </div>
  );
}
