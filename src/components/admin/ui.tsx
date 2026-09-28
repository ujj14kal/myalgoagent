import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Building blocks for the admin portal. Server-safe (no client state).

export function AdminPageHeader({ title, description, icon: Icon, actions }: { title: string; description?: React.ReactNode; icon: LucideIcon; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1b1340] to-brand-primary text-white shadow-[0_10px_24px_-12px_rgba(71,24,152,0.8)]">
          <Icon size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy">{title}</h1>
          {description && <p className="mt-0.5 max-w-3xl text-sm text-brand-navy/55">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon: Icon, action, children, className = "", pad = true }: { title?: React.ReactNode; icon?: LucideIcon; action?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-2xl bg-white shadow-[0_1px_2px_rgba(14,27,45,0.04),0_12px_32px_-20px_rgba(14,27,45,0.25)] ring-1 ring-black/[0.05] ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            {Icon && <Icon size={15} className="text-brand-primary" />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone = "default", href, spark }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad"; href?: string; spark?: number[] }) {
  const ring = { default: "ring-black/[0.05]", good: "ring-brand-buy/25", warn: "ring-brand-gold/40", bad: "ring-brand-sell/30" }[tone];
  const dot = { default: "bg-brand-primary", good: "bg-brand-buy", warn: "bg-brand-gold", bad: "bg-brand-sell" }[tone];
  const inner = (
    <div className={`group relative h-full overflow-hidden rounded-2xl bg-white p-4 shadow-[0_12px_32px_-22px_rgba(14,27,45,0.3)] ring-1 transition-shadow hover:shadow-[0_16px_36px_-20px_rgba(71,24,152,0.35)] ${ring}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-navy/45">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-1.5 text-[1.65rem] font-bold leading-none tracking-tight text-brand-navy tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-brand-navy/50">{hint}</p>}
      {spark && spark.length > 1 && (
        <div className="absolute bottom-0 right-0 w-28 opacity-80">
          <Sparkline values={spark} height={36} />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** A tiny area chart. */
export function Sparkline({ values, height = 40, color = "var(--brand-primary)" }: { values: number[]; height?: number; color?: string }) {
  const w = 120;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  let h = 0;
  for (const ch of `${color}|${values.join(",")}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const id = `spark${(h >>> 0).toString(36)}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="block h-auto w-full" aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Daily bars with a label under the first and last. */
export function Bars({ data, format = (v: number) => String(v), color = "var(--brand-primary)" }: { data: { label: string; value: number }[]; format?: (v: number) => string; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.label} className="group relative flex-1" style={{ height: "100%" }}>
            <div className="absolute bottom-0 w-full rounded-t-[3px] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, background: color, opacity: d.value ? 0.85 : 0.15 }} />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-brand-navy px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:block">
              {d.label}: {format(d.value)}
            </span>
          </div>
        ))}
      </div>
      {data.length > 1 && (
        <div className="mt-1.5 flex justify-between text-[10px] text-brand-navy/40">
          <span>{data[0].label}</span>
          <span>{data[data.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}

const PILL = {
  gray: "bg-brand-navy/[0.06] text-brand-navy/60",
  purple: "bg-brand-primary/10 text-brand-primary",
  green: "bg-brand-buy/10 text-[#0b6b30]",
  gold: "bg-brand-gold/15 text-[#6f5a22]",
  red: "bg-brand-sell/10 text-[#9b1111]",
  blue: "bg-brand-blue-light text-[#23408f]",
} as const;
export type PillTone = keyof typeof PILL;

export function Pill({ tone = "gray", children, dot = false }: { tone?: PillTone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-brand-navy/45">{children}</p>;
}

export function LoadError({ error }: { error: string }) {
  return <p className="rounded-xl bg-brand-sell/5 px-3 py-2 text-xs text-brand-sell">Couldn&apos;t load: {error}</p>;
}

export const ago = (d: Date | string | null | undefined) => {
  if (!d) return "never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86_400 * 30) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

export const ist = (d: Date | string | null | undefined, withTime = true) =>
  d
    ? new Date(d).toLocaleString("en-IN", withTime ? { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" } : { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";

export const TICKET_TONE = { OPEN: "gold", PENDING: "purple", RESOLVED: "green" } as const;
export const TICKET_LABEL = { OPEN: "Needs reply", PENDING: "Waiting on user", RESOLVED: "Resolved" } as const;
export const PRIORITY_TONE = { LOW: "gray", NORMAL: "blue", HIGH: "gold", URGENT: "red" } as const;
