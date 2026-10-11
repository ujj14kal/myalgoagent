"use client";

import { useMemo, useState, useTransition } from "react";
import { Sparkles, Undo2, Wand2 } from "lucide-react";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";
import { writeRuleCodeAction } from "@/lib/rule-code-actions";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { parseDsl, DslSyntaxError, INDICATOR_CATALOG } from "@/lib/strategy";

const INDICATOR_CHEATSHEET = INDICATOR_CATALOG.map((d) => ({
  syntax: `${d.dslName}(${d.defaults.join(", ")})`,
  desc: d.paramLabels.length > 0 ? `${d.label} — ${d.paramLabels.join(", ")}` : d.label,
}));

const CHEATSHEET = [
  { syntax: "close / open / high / low / volume", desc: "Raw price/volume of the current bar" },
  { syntax: "a > b, a < b, a >= b, a <= b, a == b", desc: "Threshold comparisons" },
  { syntax: "a crossesAbove b, a crossesBelow b", desc: "Crossover detection" },
  { syntax: "and, or, not, ( )", desc: "Combine conditions" },
  ...INDICATOR_CHEATSHEET,
];

export default function StrategyCodeEditor({
  label,
  value,
  onChange,
  part,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Which rule this is, so the assistant writes the right kind (open vs close). */
  part: "entry" | "exit";
}) {
  const [showHelp, setShowHelp] = useState(false);
  const { agentName } = useAgentChat();
  const [ask, setAsk] = useState("");
  const [busy, startAi] = useTransition();
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [before, setBefore] = useState<string | null>(null);

  function writeWithAi(fix?: string) {
    setNote(null);
    startAi(async () => {
      const r = await writeRuleCodeAction({ description: ask, part, current: value, problem: fix });
      if (!r.ok) return setNote({ tone: "error", text: r.error });
      setBefore(value);
      onChange(r.code);
      setNote({ tone: "ok", text: `${agentName} wrote this${r.retried ? " (after correcting a first try)" : ""}. Read it, then change anything you like — it is checked the same way as code you type.` });
    });
  }

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
        <div className="mb-2 max-h-64 overflow-y-auto rounded-lg border border-black/5 bg-brand-bg p-3 text-xs">
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
          <button type="button" disabled={busy} onClick={() => writeWithAi(typeof error === "string" ? error : `line ${error.line}, column ${error.column}: ${error.message}`)} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline disabled:opacity-50">
            <Wand2 size={11} /> Fix it with {agentName}
          </button>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ask.trim() && !busy) {
              e.preventDefault();
              writeWithAi();
            }
          }}
          maxLength={600}
          placeholder={part === "entry" ? "Or describe it: buy when the 20 average crosses above the 50 and RSI isn't overbought" : "Or describe it: exit when RSI goes above 70 or price falls under the 20 average"}
          aria-label={`Describe the ${part} rule in words`}
          className="min-w-[14rem] flex-1 rounded-lg border border-brand-navy/15 px-3 py-1.5 text-xs outline-none focus:border-brand-primary"
        />
        <button type="button" disabled={busy || !ask.trim()} onClick={() => writeWithAi()} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          <Sparkles size={12} /> {busy ? "Writing…" : `Write it with ${agentName}`}
        </button>
        {before !== null && !busy && (
          <button type="button" onClick={() => { onChange(before); setBefore(null); setNote(null); }} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy/55 hover:text-brand-navy">
            <Undo2 size={12} /> Undo
          </button>
        )}
      </div>
      {note && <p className={`mt-1 text-xs ${note.tone === "ok" ? "text-brand-navy/55" : "text-brand-sell"}`}>{note.text}</p>}
    </div>
  );
}
