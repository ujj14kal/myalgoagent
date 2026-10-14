import Link from "next/link";
import { Activity, Bug, LogIn, ScrollText, Server, ShieldAlert, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/access";
import { getAlarmHistory, getAlarms, load, searchServerLogs } from "@/lib/admin/aws";
import { hourBuckets, parseLogFilters, RANGES, siteEventWhere, type LogFilters, type LogTab } from "@/lib/admin/site-log-query";
import { daysAgo } from "@/lib/admin/time";
import { RETENTION_DAYS } from "@/lib/site-log";
import { AdminPageHeader, Bars, Card, Empty, Kpi, LoadError, Pill, ago, ist } from "@/components/admin/ui";

export const maxDuration = 30;
const PAGE = 50;

const TAB_LABEL: Record<LogTab, string> = { errors: "Errors", signins: "Sign-ins", warnings: "Warnings", server: "Server log", outages: "Outages" };
const KIND_LABEL: Record<string, { label: string; tone: "red" | "gold" | "green" | "purple" | "blue" | "gray" }> = {
  server_error: { label: "Server", tone: "red" },
  client_error: { label: "Browser", tone: "purple" },
  engine_error: { label: "Engine", tone: "red" },
  warning: { label: "Warning", tone: "gold" },
  sign_in: { label: "Signed in", tone: "green" },
  sign_in_failed: { label: "Failed", tone: "gold" },
};

function href(f: LogFilters, patch: Partial<Record<keyof LogFilters, string>>) {
  const p = new URLSearchParams();
  const all = { tab: f.tab, range: f.range, q: f.q, user: f.user, source: f.source, page: String(f.page), ...patch };
  for (const [k, v] of Object.entries(all)) if (v && !(k === "page" && v === "1") && !(k === "range" && v === "24h") && !(k === "tab" && v === "errors")) p.set(k, v);
  const s = p.toString();
  return `/admin/logs${s ? `?${s}` : ""}`;
}

const shortUa = (ua: string | null) => {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
};

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff("system");
  const f = parseLogFilters(await searchParams);

  // The account a user filter means: an id, an email or a username.
  const matched = f.user
    ? await prisma.user.findFirst({ where: { OR: [{ id: f.user }, { email: f.user.toLowerCase() }, { username: f.user.toLowerCase() }] }, select: { id: true } })
    : null;
  const since = daysAgo(1);
  const [errors24, users24, signins24, failed24, hourly] = await Promise.all([
    prisma.siteEvent.aggregate({ where: { kind: { in: ["server_error", "client_error", "engine_error"] }, at: { gte: since } }, _sum: { count: true } }),
    prisma.siteEvent.findMany({ where: { kind: { in: ["server_error", "client_error"] }, at: { gte: since }, userId: { not: null } }, distinct: ["userId"], select: { userId: true } }),
    prisma.siteEvent.count({ where: { kind: "sign_in", at: { gte: since } } }),
    prisma.siteEvent.count({ where: { kind: "sign_in_failed", at: { gte: since } } }),
    prisma.siteEvent.findMany({ where: { kind: { in: ["server_error", "client_error", "engine_error"] }, at: { gte: since } }, select: { at: true, count: true } }),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Logs"
        icon={ScrollText}
        description={`What went wrong on the site and who it touched: server and browser errors, sign-ins and failed sign-ins, outages, and the raw server log. Events are kept ${RETENTION_DAYS} days here; the raw server log in AWS goes back years.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Errors (24h)" value={(errors24._sum.count ?? 0).toLocaleString("en-IN")} tone={errors24._sum.count ? "warn" : "good"} hint="every repeat counted" href={href(f, { tab: "errors", range: "24h", page: "1" })} />
        <Kpi label="People hit by an error" value={users24.length} tone={users24.length ? "warn" : "good"} hint="signed-in users, 24h" />
        <Kpi label="Sign-ins (24h)" value={signins24} hint="successful" href={href(f, { tab: "signins", range: "24h", page: "1" })} />
        <Kpi label="Failed sign-ins (24h)" value={failed24} tone={failed24 > 20 ? "bad" : failed24 ? "warn" : "good"} hint="wrong password, suspended…" href={href(f, { tab: "signins", q: "", page: "1" })} />
      </div>

      <Card title="Errors per hour · last 24 hours" icon={Activity}>
        <Bars data={hourBuckets(hourly, 24)} />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TAB_LABEL) as LogTab[]).map((t) => (
          <Link key={t} href={href(f, { tab: t, page: "1" })} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ${f.tab === t ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy/60 ring-black/[0.06] hover:text-brand-navy"}`}>
            {TAB_LABEL[t]}
          </Link>
        ))}
      </div>

      {f.tab === "outages" ? <Outages /> : f.tab === "server" ? <ServerLog f={f} /> : <Events f={f} userId={matched?.id ?? null} />}
    </div>
  );
}

function Filters({ f, server = false }: { f: LogFilters; server?: boolean }) {
  return (
    <form className="flex flex-wrap items-end gap-2" action="/admin/logs">
      <input type="hidden" name="tab" value={f.tab} />
      <label className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">
        Search
        <input name="q" defaultValue={f.q} placeholder={server ? "any text in the log line" : "message, page or area"} className="mt-1 block w-56 rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-sm font-normal normal-case text-brand-navy outline-none focus:border-brand-primary" />
      </label>
      {!server && (
        <label className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">
          Customer
          <input name="user" defaultValue={f.user} placeholder="email, username or id" className="mt-1 block w-52 rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-sm font-normal normal-case text-brand-navy outline-none focus:border-brand-primary" />
        </label>
      )}
      {!server && (
        <label className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">
          From
          <select name="source" defaultValue={f.source} className="mt-1 block rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-sm font-normal normal-case text-brand-navy">
            <option value="">Everywhere</option>
            <option value="web">Website server</option>
            <option value="browser">Customer&apos;s browser</option>
            <option value="engine">Live engine</option>
          </select>
        </label>
      )}
      <label className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">
        When
        <select name="range" defaultValue={f.range} className="mt-1 block rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-sm font-normal normal-case text-brand-navy">
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => (
            <option key={r} value={r}>{{ "1h": "Last hour", "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days" }[r]}</option>
          ))}
        </select>
      </label>
      <button className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary-light">Apply</button>
      {(f.q || f.user || f.source) && <Link href={href({ ...f, q: "", user: "", source: "", page: 1 }, {})} className="px-1 py-2 text-xs font-semibold text-brand-navy/50 hover:text-brand-primary">Clear</Link>}
    </form>
  );
}

async function Events({ f, userId }: { f: LogFilters; userId: string | null }) {
  const where = siteEventWhere(f, userId);
  const [rows, total] = await Promise.all([prisma.siteEvent.findMany({ where, orderBy: { at: "desc" }, skip: (f.page - 1) * PAGE, take: PAGE }), prisma.siteEvent.count({ where })]);
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } }) : [];
  const who = new Map(users.map((u) => [u.id, u]));
  const Icon = f.tab === "signins" ? LogIn : f.tab === "warnings" ? TriangleAlert : Bug;
  return (
    <div className="space-y-4">
      <Filters f={f} />
      {f.user && !userId && <p className="rounded-xl bg-brand-gold/10 px-3 py-2 text-xs text-[#6f5a22]">No account matches “{f.user}”, so nothing is shown.</p>}
      <Card title={`${TAB_LABEL[f.tab]} · ${total.toLocaleString("en-IN")}`} icon={Icon} pad={false}>
        {rows.length === 0 ? (
          <Empty>{f.tab === "signins" ? "No sign-ins in this window." : "Nothing in this window. 🎉"}</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {rows.map((r) => {
              const k = KIND_LABEL[r.kind] ?? { label: r.kind, tone: "gray" as const };
              const u = r.userId ? who.get(r.userId) : null;
              const ua = shortUa(r.userAgent);
              const detail = r.detail ? JSON.stringify(r.detail, null, 1) : "";
              return (
                <li key={r.id}>
                  <details className="group px-5 py-3">
                    <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-start gap-3">
                      <span className="flex flex-col items-start gap-1">
                        <Pill tone={k.tone}>{k.label}</Pill>
                        {r.count > 1 && <Pill>{r.count}×</Pill>}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-brand-navy">{r.message || "(no message)"}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-brand-navy/50">
                          <span className="font-mono">{r.context}</span>
                          {r.path && <> · <span className="font-mono">{r.method ? `${r.method} ` : ""}{r.path}</span></>}
                          {u ? <> · {u.email}</> : r.userId ? <> · account {r.userId.slice(0, 8)}…</> : <> · not signed in</>}
                          {ua && <> · {ua}</>}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-right text-[11px] text-brand-navy/40" title={ist(r.at)}>{ago(r.at)}</span>
                    </summary>
                    <div className="mt-3 space-y-2 rounded-xl bg-brand-navy p-3 text-[11px] leading-relaxed text-white/80">
                      <p>
                        <span className="text-white/45">When</span> {ist(r.at)} IST · <span className="text-white/45">From</span> {r.source}
                        {r.ip && <> · <span className="text-white/45">IP</span> {r.ip}</>}
                        {r.digest && <> · <span className="text-white/45">Reference</span> <span className="font-mono">{r.digest}</span></>}
                      </p>
                      {r.userAgent && <p className="break-all text-white/55">{r.userAgent}</p>}
                      {detail && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px]">{detail}</pre>}
                      <p className="flex flex-wrap gap-3 pt-1">
                        {r.userId && <Link href={`/admin/users/${r.userId}`} className="font-semibold text-brand-gold-light hover:underline">Open this customer →</Link>}
                        {r.userId && <Link href={href(f, { user: r.userId, page: "1" })} className="font-semibold text-brand-gold-light hover:underline">Everything for this customer →</Link>}
                        <Link href={href(f, { q: r.context, page: "1" })} className="font-semibold text-brand-gold-light hover:underline">More from {r.context} →</Link>
                      </p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {total > PAGE && (
        <div className="flex justify-between text-xs text-brand-navy/55">
          <span>{total.toLocaleString("en-IN")} events</span>
          <span className="flex gap-2">
            {f.page > 1 && <Link href={href(f, { page: String(f.page - 1) })} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-black/[0.06]">← Newer</Link>}
            {f.page * PAGE < total && <Link href={href(f, { page: String(f.page + 1) })} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-black/[0.06]">Older →</Link>}
          </span>
        </div>
      )}
    </div>
  );
}

async function ServerLog({ f }: { f: LogFilters }) {
  const level = f.q ? "any" : "error";
  const lines = await load(() => searchServerLogs({ hours: f.hours, text: f.q, level }));
  return (
    <div className="space-y-4">
      <Filters f={f} server />
      <p className="text-xs text-brand-navy/50">{f.q ? "Every line containing your text" : "Errors only (search for text to see every line)"}, newest first, up to 200 — straight from the website and live-engine logs in AWS.</p>
      <Card title="Server log" icon={Server} pad={false}>
        {!lines.ok ? (
          <div className="p-5"><LoadError error={lines.error} /></div>
        ) : lines.data.length === 0 ? (
          <Empty>No matching lines in this window.</Empty>
        ) : (
          <ul className="max-h-[640px] divide-y divide-black/[0.04] overflow-y-auto">
            {lines.data.map((l, i) => {
              const level = String(l.json?.level ?? "");
              const err = l.json?.error as { message?: string } | undefined;
              const headline = String(l.json?.message ?? err?.message ?? l.json?.msg ?? l.text).slice(0, 220);
              return (
                <li key={`${l.at}-${i}`}>
                  <details className="px-5 py-2.5">
                    <summary className="flex cursor-pointer list-none items-start gap-3">
                      <Pill tone={level === "error" ? "red" : level === "warn" ? "gold" : "gray"}>{level || l.group}</Pill>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-brand-navy">{headline}</span>
                        <span className="block truncate font-mono text-[11px] text-brand-navy/45">{l.group}{l.json?.context ? ` · ${String(l.json.context)}` : ""}</span>
                      </span>
                      <span className="whitespace-nowrap text-[11px] text-brand-navy/40">{ist(l.at)}</span>
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-brand-navy p-3 text-[10.5px] leading-relaxed text-white/80">{l.json ? JSON.stringify(l.json, null, 1).slice(0, 5000) : l.text}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

async function Outages() {
  const [alarms, history] = await Promise.all([load(getAlarms), load(() => getAlarmHistory(30))]);
  const firing = alarms.ok ? alarms.data.filter((a) => a.state === "ALARM") : [];
  // Hours with an unusual number of errors are the site's own sign of trouble, even when no alarm fired.
  const since = daysAgo(7);
  const events = await prisma.siteEvent.findMany({ where: { kind: { in: ["server_error", "client_error", "engine_error"] }, at: { gte: since } }, select: { at: true, count: true, context: true } });
  const perHour = new Map<number, { n: number; contexts: Map<string, number> }>();
  for (const e of events) {
    const h = Math.floor(e.at.getTime() / 3_600_000);
    const cur = perHour.get(h) ?? { n: 0, contexts: new Map() };
    cur.n += e.count;
    cur.contexts.set(e.context, (cur.contexts.get(e.context) ?? 0) + e.count);
    perHour.set(h, cur);
  }
  const bursts = [...perHour.entries()].filter(([, v]) => v.n >= 10).sort((a, b) => b[0] - a[0]).slice(0, 20);
  return (
    <div className="space-y-5">
      <Card title="Right now" icon={ShieldAlert}>
        {!alarms.ok ? (
          <LoadError error={alarms.error} />
        ) : firing.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-brand-navy"><Pill tone="green" dot>all clear</Pill> {alarms.data.length} alarms watched, none firing (site down, server errors, database, cost and more).</p>
        ) : (
          <ul className="space-y-2">
            {firing.map((a) => (
              <li key={a.name} className="flex items-start gap-3 rounded-xl bg-brand-sell/5 px-3 py-2 text-sm">
                <Pill tone="red" dot>firing</Pill>
                <span><span className="font-semibold text-brand-navy">{a.name}</span><span className="block text-[11px] text-brand-navy/55">{a.reason.slice(0, 200)} · since {ago(a.updated)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Alarm history · last 30 days" icon={Activity} pad={false}>
        {!history.ok ? (
          <div className="p-5 text-sm text-brand-navy/60">
            <LoadError error={history.error} />
            <p className="mt-2 text-xs">Reading alarm history needs the permission <span className="font-mono">cloudwatch:DescribeAlarmHistory</span> on the website&apos;s role. It is in infra/web/template.yaml and takes effect when that stack is next updated.</p>
          </div>
        ) : history.data.length === 0 ? (
          <Empty>No alarm changes in the last 30 days. Nothing went down.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {history.data.slice(0, 60).map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex items-start gap-3 px-5 py-2.5">
                <Pill tone={h.to === "ALARM" ? "red" : h.to === "OK" ? "green" : "gray"} dot>{h.to === "ALARM" ? "went off" : h.to === "OK" ? "recovered" : h.to.toLowerCase()}</Pill>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-brand-navy">{h.name}</span><span className="block truncate text-[11px] text-brand-navy/50">{h.summary}</span></span>
                <span className="whitespace-nowrap text-[11px] text-brand-navy/40">{ist(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Hours with a burst of errors · last 7 days" icon={Bug} pad={false}>
        {bursts.length === 0 ? (
          <Empty>No hour had 10 or more errors.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {bursts.map(([h, v]) => (
              <li key={h} className="flex items-start gap-3 px-5 py-2.5">
                <Pill tone={v.n >= 50 ? "red" : "gold"}>{v.n}×</Pill>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-brand-navy/70">{[...v.contexts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} (${n})`).join(" · ")}</span>
                <Link href={`/admin/logs?range=7d`} className="whitespace-nowrap text-[11px] text-brand-navy/40 hover:text-brand-primary">{ist(new Date(h * 3_600_000))}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
