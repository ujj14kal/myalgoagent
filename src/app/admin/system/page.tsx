import { Activity, Bell, Bug, Database, DollarSign, Globe, Mail, Rocket, Server, ShieldAlert } from "lucide-react";
import { licensedFeedStatus } from "@/lib/market-data";
import { requireStaff } from "@/lib/admin/access";
import { getAlarms, getCost, getDatabase, getDeploys, getEmailStatus, getRecentLogs, getSecurityFindings, load } from "@/lib/admin/aws";
import RefreshCost from "@/components/admin/refresh-cost";
import { currentEgressIp } from "@/lib/brokers/egress";
import { AdminPageHeader, Bars, Card, Empty, Kpi, LoadError, Pill, Sparkline, ago, ist } from "@/components/admin/ui";

export const maxDuration = 30;

const money = (v: number) => `$${v.toFixed(2)}`;

export default async function SystemPage() {
  await requireStaff("system");
  const [alarms, logs, email, cost, deploys, db, findings, egress] = await Promise.all([
    load(getAlarms),
    load(() => getRecentLogs(24)),
    load(getEmailStatus),
    load(() => getCost()),
    load(() => getDeploys(8)),
    load(getDatabase),
    load(getSecurityFindings),
    load(currentEgressIp),
  ]);
  const staticIp = process.env.BROKER_EGRESS_URL?.match(/\/\/([^:/]+)/)?.[1] ?? null;

  const firing = alarms.ok ? alarms.data.filter((a) => a.state === "ALARM").length : null;
  const errors = logs.ok ? logs.data.filter((l) => l.level === "error") : [];
  const groups = logs.ok
    ? [...logs.data.reduce((m, l) => m.set(`${l.level}|${l.context}`, [...(m.get(`${l.level}|${l.context}`) ?? []), l]), new Map<string, typeof logs.data>()).entries()].sort((a, b) => b[1].length - a[1].length)
    : [];

  return (
    <div className="space-y-5">
      <AdminPageHeader title="System & AWS" icon={Server} description="Live health of the platform, read straight from AWS — so you rarely need the AWS console. Read-only, apart from pausing jobs on Trading ops." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Alarms firing" value={firing ?? "—"} tone={firing ? "bad" : firing === 0 ? "good" : "default"} hint={alarms.ok ? `${alarms.data.length} alarms watched` : "unavailable"} />
        <Kpi label="Errors (24h)" value={logs.ok ? errors.length : "—"} tone={errors.length ? "warn" : "good"} hint={logs.ok ? `${logs.data.length - errors.length} warnings` : "unavailable"} />
        <Kpi label="Email" value={email.ok ? (email.data.production ? "Live" : "Sandbox") : "—"} tone={email.ok ? (email.data.production ? "good" : "bad") : "default"} hint={email.ok ? `${email.data.sent24h}/${email.data.max24h} sent in 24h` : "unavailable"} />
        <Kpi label="AWS this month" value={cost.ok ? money(cost.data.value.monthToDate) : "—"} hint={cost.ok ? (cost.data.value.forecastMonth !== null ? `forecast ${money(cost.data.value.forecastMonth)}` : "no forecast yet") : "unavailable"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Alarms" icon={Bell} pad={false}>
          {!alarms.ok ? (
            <div className="p-5"><LoadError error={alarms.error} /></div>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {alarms.data.map((a) => (
                <li key={`${a.region}-${a.name}`} className="flex items-start gap-3 px-5 py-2.5">
                  <Pill tone={a.state === "OK" ? "green" : a.state === "ALARM" ? "red" : "gold"} dot>
                    {a.state === "INSUFFICIENT_DATA" ? "no data" : a.state.toLowerCase()}
                  </Pill>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-brand-navy">{a.name}</span>
                    {a.state !== "OK" && <span className="block text-[11px] text-brand-navy/50">{a.reason.slice(0, 160)}</span>}
                  </span>
                  <span className="text-[11px] text-brand-navy/40">{ago(a.updated)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Errors & warnings · last 24h" icon={Bug} pad={false}>
          {!logs.ok ? (
            <div className="p-5"><LoadError error={logs.error} /></div>
          ) : groups.length === 0 ? (
            <Empty>No errors or warnings in the last 24 hours. 🎉</Empty>
          ) : (
            <ul className="max-h-[420px] divide-y divide-black/[0.04] overflow-y-auto">
              {groups.map(([key, items]) => {
                const [level, context] = key.split("|");
                const latest = items[0];
                return (
                  <li key={key}>
                    <details className="group px-5 py-2.5">
                      <summary className="flex cursor-pointer list-none items-center gap-3">
                        <Pill tone={level === "error" ? "red" : "gold"}>{items.length}×</Pill>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-xs font-semibold text-brand-navy">{context}</span>
                          <span className="block truncate text-[11px] text-brand-navy/55">{latest.message || "(no message)"}</span>
                        </span>
                        <span className="text-[11px] text-brand-navy/40">{ago(latest.at)}</span>
                      </summary>
                      <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-brand-navy p-3 text-[10.5px] leading-relaxed text-white/80">
                        {items
                          .slice(0, 5)
                          .map((i) => `${i.at}  ${i.message}\n${JSON.stringify(i.meta, null, 1).slice(0, 600)}`)
                          .join("\n\n")}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Email (Amazon SES)" icon={Mail}>
          <div id="email" />
          {!email.ok ? (
            <LoadError error={email.error} />
          ) : (
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                {email.data.production ? <Pill tone="green" dot>production access</Pill> : <Pill tone="red" dot>sandbox</Pill>}
                {email.data.review && <Pill>review: {email.data.review.toLowerCase()}</Pill>}
              </p>
              {!email.data.production && (
                <p className="rounded-xl bg-brand-sell/5 px-3 py-2 text-xs leading-relaxed text-[#9b1111]">
                  In the sandbox, email only reaches verified addresses — real users don&apos;t get sign-in links, password resets or support replies. Request production access in the AWS console (SES → Account dashboard). In-app replies still work.
                </p>
              )}
              <div>
                <p className="text-xs text-brand-navy/50">
                  Sent in the last 24h: {email.data.sent24h} of {email.data.max24h.toLocaleString("en-IN")} · max {email.data.maxPerSecond}/second
                </p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-navy/[0.06]">
                  <div className="h-full rounded-full bg-brand-primary" style={{ width: `${Math.min(100, (email.data.sent24h / Math.max(1, email.data.max24h)) * 100)}%` }} />
                </div>
              </div>
              {email.data.enforcement && email.data.enforcement !== "HEALTHY" && <Pill tone="red">reputation: {email.data.enforcement.toLowerCase()}</Pill>}
            </div>
          )}
        </Card>

        <Card title="AWS cost" icon={DollarSign} className="lg:col-span-2" action={<RefreshCost />}>
          <div id="cost" />
          {!cost.ok ? (
            <LoadError error={cost.error} />
          ) : (
            <div className="grid gap-5 md:grid-cols-[1fr_240px]">
              <div>
                <Bars data={cost.data.value.daily.map((d) => ({ label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }), value: d.amount }))} format={money} color="var(--brand-blue)" />
                <p className="mt-2 text-[11px] text-brand-navy/40">
                  Usage before credits · last month {money(cost.data.value.lastMonth)} · updated {ago(cost.data.at)} (refreshes daily)
                </p>
              </div>
              <ul className="space-y-1.5 text-xs">
                {cost.data.value.byService.slice(0, 8).map((s) => (
                  <li key={s.service} className="flex justify-between gap-2">
                    <span className="truncate text-brand-navy/65">{s.service.replace("Amazon ", "").replace("AWS ", "")}</span>
                    <span className="font-semibold tabular-nums text-brand-navy">{money(s.amount)}</span>
                  </li>
                ))}
                {cost.data.value.byService.length === 0 && <li className="text-brand-navy/45">Nothing billed yet this month.</li>}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Deploys" icon={Rocket} pad={false}>
          <div id="deploys" />
          {!deploys.ok ? (
            <div className="p-5"><LoadError error={deploys.error} /></div>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {deploys.data.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Pill tone={d.status === "SUCCEED" ? "green" : d.status === "FAILED" ? "red" : "blue"} dot>
                    #{d.id}
                  </Pill>
                  <span className="min-w-0 flex-1 truncate text-brand-navy">{d.message}</span>
                  <span className="font-mono text-[11px] text-brand-navy/40">{d.commit}</span>
                  <span className="w-16 text-right text-[11px] text-brand-navy/40">{ago(d.endedAt ?? d.startedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Database" icon={Database}>
          {!db.ok ? (
            <LoadError error={db.error} />
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <Pill tone={db.data.status === "available" ? "green" : "gold"} dot>{db.data.status}</Pill>
                <Pill>{db.data.instanceClass}</Pill>
                <Pill>{db.data.engine}</Pill>
                <Pill tone={db.data.encrypted ? "green" : "red"}>{db.data.encrypted ? "encrypted" : "not encrypted"}</Pill>
                <Pill tone={db.data.deletionProtection ? "green" : "gold"}>{db.data.deletionProtection ? "deletion protected" : "no deletion protection"}</Pill>
                <Pill tone={db.data.public ? "gold" : "green"}>{db.data.public ? "reachable from internet" : "private"}</Pill>
              </div>
              <p className="text-xs text-brand-navy/55">
                {db.data.storageGb} GB · backups kept {db.data.backupDays} days · restorable to {ist(db.data.latestRestorable)}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["CPU %", db.data.cpu, "var(--brand-primary)"],
                  ["Free GB", db.data.freeStorageGb, "var(--brand-buy)"],
                  ["Connections", db.data.connections, "var(--brand-gold)"],
                ].map(([label, values, color]) => (
                  <div key={label as string}>
                    <p className="text-[11px] text-brand-navy/45">
                      {label as string} <span className="font-semibold text-brand-navy">{(values as number[]).at(-1) ?? "—"}</span>
                    </p>
                    <Sparkline values={(values as number[]).length ? (values as number[]) : [0, 0]} height={34} color={color as string} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <MarketFeedCard />

      <Card title="Broker static IP" icon={Globe}>
        {!staticIp ? (
          <p className="text-sm text-brand-navy/60">Not configured — broker calls go out directly from Amplify (no fixed IP). Live orders need the relay.</p>
        ) : !egress.ok ? (
          <div className="space-y-2">
            <p className="text-sm text-brand-navy">
              Static IP <strong className="font-mono">{staticIp}</strong>
            </p>
            <LoadError error={`the relay didn't answer (${egress.error}) — broker calls will fail until it's back`} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Brokers see <strong className="font-mono text-brand-navy">{egress.data.ip}</strong>
            </span>
            {egress.data.ip === staticIp ? <Pill tone="green" dot>relay working</Pill> : <Pill tone="red" dot>not the registered IP ({staticIp})</Pill>}
            <span className="text-xs text-brand-navy/45">Register this IP on the broker account. Relay: CloudFormation stack “myalgoagent-egress”.</span>
          </div>
        )}
      </Card>

      <Card title="Security findings (GuardDuty)" icon={ShieldAlert} pad={false}>
        {!findings.ok ? (
          <div className="p-5"><LoadError error={findings.error} /></div>
        ) : findings.data.length === 0 ? (
          <Empty>No open security findings. 🛡️</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {findings.data.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Pill tone={f.severity >= 7 ? "red" : f.severity >= 4 ? "gold" : "gray"}>sev {f.severity.toFixed(1)}</Pill>
                <span className="min-w-0 flex-1 truncate text-brand-navy">{f.title}</span>
                <span className="text-[11px] text-brand-navy/40">
                  {f.count}× · {ago(f.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** The licensed market-data feed (TrueData): configured, answering, or down with the reason. */
function MarketFeedCard() {
  const feed = licensedFeedStatus();
  const allow = (process.env.MARKET_DATA_LICENSED_USER_IDS ?? "").split(",").filter((x) => x.trim()).length;
  return (
    <Card title="Market data feed" icon={Activity}>
      {!feed.configured ? (
        <p className="text-sm text-brand-navy/60">No licensed feed configured — everyone is on the standard data. Add MARKET_DATA_TRUEDATA_USER/_PASSWORD to switch it on.</p>
      ) : feed.available ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Pill tone="green" dot>TrueData answering</Pill>
          <span className="text-brand-navy/60">
            {allow} account{allow === 1 ? "" : "s"} allowed · trading paths {process.env.MARKET_DATA_LICENSED_FOR_TRADING === "true" ? "on the feed" : "on standard data"}
          </span>
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <Pill tone="red" dot>TrueData down — everyone on standard data</Pill>
          <p className="text-brand-navy/60">
            {feed.reason ?? "login refused"}. Rechecked automatically{feed.recheckAt ? ` at ${ist(new Date(feed.recheckAt))}` : ""}; live features switch back on by themselves when it answers.
          </p>
        </div>
      )}
    </Card>
  );
}
