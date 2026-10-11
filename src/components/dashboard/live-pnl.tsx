"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LivePnl } from "@/lib/live/pnl-server";

const inr = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const tone = (n: number) => (n > 0 ? "text-[#0b6b30]" : n < 0 ? "text-brand-sell" : "text-brand-navy/70");

/** Indian market hours, so the card polls quickly while it can move and rests otherwise. */
function marketOpen(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.getUTCDay();
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && m >= 9 * 60 + 15 && m <= 15 * 60 + 30;
}

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const span = max - min || 1;
  const w = 220;
  const h = 44;
  const y = (v: number) => h - ((v - min) / span) * h;
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full max-w-[14rem]" role="img" aria-label="P&L through today">
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="3 3" />
      <path d={d} fill="none" stroke={last >= 0 ? "#0b9d4a" : "#d93a3a"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Today's real P&L, moving with the market: each live strategy's booked and open profit or loss. */
export default function LivePnlCard({ initial }: { initial: LivePnl | null }) {
  const start: LivePnl = initial ?? { at: 0, rows: [], total: 0, realised: 0, unrealised: 0, priced: true };
  const [data, setData] = useState<LivePnl>(start);
  const [error, setError] = useState<string | null>(null);
  const [trail, setTrail] = useState<number[]>([start.total]);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const res = await fetch("/api/live/pnl", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't read your live P&L just now.");
      setData(body as LivePnl);
      setTrail((t) => [...t.slice(-239), (body as LivePnl).total]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read your live P&L just now.");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), marketOpen() ? 5_000 : 60_000);
    const vis = () => void load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);

  const open = marketOpen();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Today&apos;s P&amp;L · live strategies</p>
          <p className={`num mt-1 text-3xl font-bold tabular-nums ${tone(data.total)}`}>{inr(data.total)}</p>
          <p className="mt-1 text-xs text-brand-navy/55">
            Booked {inr(data.realised)} · open {inr(data.unrealised)}
            <span className="ml-2 inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${open ? "animate-pulse bg-brand-buy" : "bg-brand-navy/25"}`} />
              {open ? "updating live" : "market closed"}
            </span>
          </p>
        </div>
        <Spark points={trail} />
      </div>
      {!data.priced && <p className="mt-2 text-xs text-[#6f5a22]">One open position has no live price right now, so its open P&amp;L isn&apos;t counted yet.</p>}
      {error && <p className="mt-2 text-xs text-brand-sell">{error}</p>}
      {data.rows.length === 0 ? (
        <p className="mt-4 text-sm text-brand-navy/50">
          No live strategy yet. <Link href="/app/live-trading" className="font-semibold text-brand-primary hover:underline">Go live →</Link>
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-black/[0.04]">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${r.status === "ACTIVE" ? "bg-brand-buy" : "bg-brand-gold"}`} />
              <span className="font-semibold text-brand-navy">{r.name}</span>
              <span className="text-xs text-brand-navy/50">
                {r.symbol}
                {r.openQty !== 0 && ` · ${r.openQty > 0 ? "long" : "short"} ${Math.abs(r.openQty)}${r.openAvg ? ` @ ₹${r.openAvg.toLocaleString("en-IN")}` : ""}${r.last ? ` · now ₹${r.last.toLocaleString("en-IN")}` : ""}`}
              </span>
              <span className={`num ml-auto font-semibold tabular-nums ${tone(r.total)}`}>{inr(r.total)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-brand-navy/40">From your real orders on your broker, before brokerage and charges. Forward tests are shown only on the Forward Testing page.</p>
    </div>
  );
}
