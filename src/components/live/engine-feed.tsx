"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

type Line = { id: string; at: string; level: "INFO" | "OK" | "WARN" | "ERROR"; message: string; deploymentId: string | null };

const DOT: Record<Line["level"], string> = { INFO: "bg-brand-navy/30", OK: "bg-brand-buy", WARN: "bg-brand-gold", ERROR: "bg-brand-sell" };
const TEXT: Record<Line["level"], string> = { INFO: "text-brand-navy/75", OK: "text-[#0b6b30]", WARN: "text-[#8a7437]", ERROR: "text-brand-sell" };

const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** What the engine is doing, in plain English, newest first. Updates by itself every few seconds. */
export default function EngineFeed({ strategies }: { strategies: { id: string; name: string }[] }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [filter, setFilter] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const newest = useRef<string | null>(null);

  const fetchLines = useCallback(
    async (params: Record<string, string>) => {
      const q = new URLSearchParams(params);
      if (filter) q.set("deployment", filter);
      const res = await fetch(`/api/live/log?${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 429 ? "Slow down a little — retrying." : "Couldn't load the activity log.");
      return ((await res.json()) as { lines: Line[] }).lines;
    },
    [filter],
  );

  useEffect(() => {
    let alive = true;
    newest.current = null;
    fetchLines({})
      .then((l) => {
        if (!alive) return;
        setLines(l);
        setMore(l.length === 60);
        newest.current = l[0]?.at ?? null;
        setError(null);
        setLoaded(true);
      })
      .catch((e: Error) => alive && (setError(e.message), setLoaded(true)));
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchLines(newest.current ? { after: newest.current } : {})
        .then((l) => {
          if (!alive) return;
          setError(null);
          if (!l.length) return;
          newest.current = l[0].at;
          setLines((cur) => {
            const seen = new Set(cur.map((x) => x.id));
            return [...l.filter((x) => !seen.has(x.id)), ...cur];
          });
        })
        .catch((e: Error) => alive && setError(e.message));
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [fetchLines]);

  async function older() {
    const last = lines[lines.length - 1];
    if (!last) return;
    try {
      const l = await fetchLines({ before: last.at });
      setLines((cur) => [...cur, ...l]);
      setMore(l.length === 60);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const name = (id: string | null) => strategies.find((s) => s.id === id)?.name;

  return (
    <section className="surface min-w-0 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
          <Activity size={16} className="text-brand-primary" /> What the engine is doing
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-buy/10 px-2 py-0.5 text-[11px] font-semibold text-[#0b6b30]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-buy" /> live
          </span>
        </p>
        {strategies.length > 1 && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-auto rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-brand-navy" aria-label="Show one strategy">
            <option value="">All strategies</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mt-1 text-xs text-brand-navy/50">Every check, signal and order, as it happens, in plain English. Times are Indian Standard Time.</p>
      {error && <p className="mt-2 text-xs text-brand-sell">{error}</p>}
      {loaded && lines.length === 0 ? (
        <p className="mt-4 text-sm text-brand-navy/50">Nothing yet. When a strategy goes live, everything the engine does for it appears here.</p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
          {lines.map((l) => (
            <li key={l.id} className="flex min-w-0 gap-2 text-[13px] leading-snug">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[l.level]}`} />
              <span className="shrink-0 font-mono text-[11px] leading-5 text-brand-navy/45">{time(l.at)}</span>
              <span className={`min-w-0 break-words ${TEXT[l.level]}`}>
                {name(l.deploymentId) && strategies.length > 1 && <strong className="font-semibold">{name(l.deploymentId)}: </strong>}
                {l.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {more && lines.length > 0 && (
        <button type="button" onClick={older} className="mt-3 text-xs font-semibold text-brand-primary">
          Show older
        </button>
      )}
    </section>
  );
}
