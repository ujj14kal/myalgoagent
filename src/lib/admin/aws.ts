import "server-only";
import { CloudWatchClient, DescribeAlarmsCommand, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand, type Expression } from "@aws-sdk/client-cost-explorer";
import { SESv2Client, GetAccountCommand } from "@aws-sdk/client-sesv2";
import { AmplifyClient, ListJobsCommand } from "@aws-sdk/client-amplify";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { GuardDutyClient, ListFindingsCommand, GetFindingsCommand } from "@aws-sdk/client-guardduty";
import { EventBridgeClient, DescribeRuleCommand, EnableRuleCommand, DisableRuleCommand } from "@aws-sdk/client-eventbridge";
import { cached } from "@/lib/jobs";

// Read-only views of the AWS account for the admin portal (plus pausing and
// resuming the two schedules). Each lookup fails on its own — a card shows
// "couldn't load" rather than breaking the page. The website's AWS role is
// limited to exactly these calls.

const REGION = "ap-south-1";
const APP_ID = "d5lc6qhib56hj";
const LOG_GROUP = "/aws/amplify/d5lc6qhib56hj";
const DB_ID = "myalgoagent-db-encrypted";
const DETECTOR_ID = "0ed07392eba86130f5aa71428c8c95e0";
const TIMEOUT = { requestTimeout: 8_000, connectionTimeout: 4_000 };

const lazy = <T>(make: () => T) => {
  let v: T | null = null;
  return () => (v ??= make());
};
const cw = lazy(() => new CloudWatchClient({ region: REGION, requestHandler: TIMEOUT }));
const cwUs = lazy(() => new CloudWatchClient({ region: "us-east-1", requestHandler: TIMEOUT }));
const logs = lazy(() => new CloudWatchLogsClient({ region: REGION, requestHandler: TIMEOUT }));
const ce = lazy(() => new CostExplorerClient({ region: "us-east-1", requestHandler: TIMEOUT }));
const ses = lazy(() => new SESv2Client({ region: REGION, requestHandler: TIMEOUT }));
const amplify = lazy(() => new AmplifyClient({ region: REGION, requestHandler: TIMEOUT }));
const rds = lazy(() => new RDSClient({ region: REGION, requestHandler: TIMEOUT }));
const gd = lazy(() => new GuardDutyClient({ region: REGION, requestHandler: TIMEOUT }));
const eb = lazy(() => new EventBridgeClient({ region: REGION, requestHandler: TIMEOUT }));

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: name === "AccessDeniedException" || /not authorized/i.test(msg) ? "The website isn't allowed to read this yet." : msg.slice(0, 200) };
  }
}

// ---------- alarms ----------
export type Alarm = { name: string; state: string; reason: string; updated: string | null; region: string };
export async function getAlarms(): Promise<Alarm[]> {
  const [a, b] = await Promise.all([cw().send(new DescribeAlarmsCommand({ MaxRecords: 100 })), cwUs().send(new DescribeAlarmsCommand({ MaxRecords: 100 }))]);
  const map = (region: string) => (m: NonNullable<typeof a.MetricAlarms>[number]): Alarm => ({
    name: m.AlarmName ?? "",
    state: m.StateValue ?? "UNKNOWN",
    reason: m.StateReason ?? "",
    updated: m.StateUpdatedTimestamp?.toISOString() ?? null,
    region,
  });
  const order: Record<string, number> = { ALARM: 0, INSUFFICIENT_DATA: 1, OK: 2 };
  return [...(a.MetricAlarms ?? []).map(map(REGION)), ...(b.MetricAlarms ?? []).map(map("us-east-1"))].sort((x, y) => (order[x.state] ?? 3) - (order[y.state] ?? 3));
}

// ---------- recent errors from the app's structured logs ----------
export type LogEntry = { at: string; level: string; context: string; message: string; meta: Record<string, unknown> };
export async function getRecentLogs(hours = 24, limit = 60): Promise<LogEntry[]> {
  const res = await logs().send(
    new FilterLogEventsCommand({
      logGroupName: LOG_GROUP,
      startTime: Date.now() - hours * 3_600_000,
      filterPattern: '{ $.level = "error" || $.level = "warn" }',
      limit: 200,
    }),
  );
  const out: LogEntry[] = [];
  for (const e of res.events ?? []) {
    try {
      const j = JSON.parse(e.message ?? "{}") as Record<string, unknown>;
      const err = j.error as { message?: string } | undefined;
      const { level, context, timestamp, message, error: _e, ...meta } = j;
      void _e;
      out.push({
        at: typeof timestamp === "string" ? timestamp : new Date(e.timestamp ?? 0).toISOString(),
        level: String(level ?? "error"),
        context: String(context ?? "unknown"),
        message: String(message ?? err?.message ?? ""),
        meta,
      });
    } catch {
      // Not one of our JSON log lines.
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---------- cost (Cost Explorer: $0.01 per call, so cached for a day) ----------
export type CostSummary = {
  currency: string;
  monthToDate: number;
  forecastMonth: number | null;
  lastMonth: number;
  byService: { service: string; amount: number }[];
  daily: { date: string; amount: number }[];
};
const NO_CREDITS: Expression = { Not: { Dimensions: { Key: "RECORD_TYPE", Values: ["Credit", "Refund"] } } };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function getCost(opts: { refresh?: boolean } = {}) {
  return cached<CostSummary>(
    "aws-cost",
    24 * 3_600_000,
    async () => {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      // One call: daily costs by service from the start of last month, which gives
      // month-to-date, last month, per-service and the daily chart.
      const usage = await ce().send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: ymd(lastMonthStart), End: ymd(tomorrow) },
          Granularity: "DAILY",
          Metrics: ["UnblendedCost"],
          GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
          Filter: NO_CREDITS,
        }),
      );
      let currency = "USD";
      let mtd = 0;
      let last = 0;
      const services = new Map<string, number>();
      const daily: { date: string; amount: number }[] = [];
      for (const day of usage.ResultsByTime ?? []) {
        const date = day.TimePeriod?.Start ?? "";
        let total = 0;
        for (const g of day.Groups ?? []) {
          const m = g.Metrics?.UnblendedCost;
          const amt = Number(m?.Amount ?? 0);
          currency = m?.Unit ?? currency;
          total += amt;
          if (date >= ymd(monthStart)) services.set(g.Keys?.[0] ?? "Other", (services.get(g.Keys?.[0] ?? "Other") ?? 0) + amt);
        }
        if (date >= ymd(monthStart)) mtd += total;
        else last += total;
        daily.push({ date, amount: Math.round(total * 100) / 100 });
      }
      let forecastMonth: number | null = null;
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      if (tomorrow < monthEnd) {
        try {
          const f = await ce().send(
            new GetCostForecastCommand({ TimePeriod: { Start: ymd(tomorrow), End: ymd(monthEnd) }, Granularity: "MONTHLY", Metric: "UNBLENDED_COST", Filter: NO_CREDITS }),
          );
          forecastMonth = mtd + Number(f.Total?.Amount ?? 0);
        } catch {
          // Too little history for a forecast early in an account's life.
        }
      }
      return {
        currency,
        monthToDate: Math.round(mtd * 100) / 100,
        forecastMonth: forecastMonth === null ? null : Math.round(forecastMonth * 100) / 100,
        lastMonth: Math.round(last * 100) / 100,
        byService: [...services.entries()].map(([service, amount]) => ({ service, amount: Math.round(amount * 100) / 100 })).filter((s) => s.amount >= 0.01).sort((a, b) => b.amount - a.amount),
        daily: daily.slice(-31),
      };
    },
    opts,
  );
}

// ---------- email (SES) ----------
export type EmailStatus = { production: boolean; review: string | null; sending: boolean; max24h: number; sent24h: number; maxPerSecond: number; enforcement: string | null };
export async function getEmailStatus(): Promise<EmailStatus> {
  const a = await ses().send(new GetAccountCommand({}));
  return {
    production: !!a.ProductionAccessEnabled,
    review: a.Details?.ReviewDetails?.Status ?? null,
    sending: !!a.SendingEnabled,
    max24h: a.SendQuota?.Max24HourSend ?? 0,
    sent24h: a.SendQuota?.SentLast24Hours ?? 0,
    maxPerSecond: a.SendQuota?.MaxSendRate ?? 0,
    enforcement: a.EnforcementStatus ?? null,
  };
}

// ---------- deploys ----------
export type Deploy = { id: string; status: string; message: string; commit: string; startedAt: string | null; endedAt: string | null };
export async function getDeploys(limit = 8): Promise<Deploy[]> {
  const res = await amplify().send(new ListJobsCommand({ appId: APP_ID, branchName: "main", maxResults: limit }));
  return (res.jobSummaries ?? []).map((j) => ({
    id: j.jobId ?? "",
    status: j.status ?? "",
    message: (j.commitMessage ?? "").split("\n")[0].slice(0, 120),
    commit: (j.commitId ?? "").slice(0, 7),
    startedAt: j.startTime?.toISOString() ?? null,
    endedAt: j.endTime?.toISOString() ?? null,
  }));
}

// ---------- database ----------
export type Database = {
  status: string;
  instanceClass: string;
  engine: string;
  storageGb: number;
  encrypted: boolean;
  multiAz: boolean;
  public: boolean;
  backupDays: number;
  latestRestorable: string | null;
  deletionProtection: boolean;
  cpu: number[];
  freeStorageGb: number[];
  connections: number[];
};
export async function getDatabase(): Promise<Database> {
  const [d, m] = await Promise.all([
    rds().send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: DB_ID })),
    cw().send(
      new GetMetricDataCommand({
        StartTime: new Date(Date.now() - 24 * 3_600_000),
        EndTime: new Date(),
        MetricDataQueries: (["CPUUtilization", "FreeStorageSpace", "DatabaseConnections"] as const).map((name, k) => ({
          Id: `m${k}`,
          MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: name, Dimensions: [{ Name: "DBInstanceIdentifier", Value: DB_ID }] }, Period: 3600, Stat: "Average" },
        })),
        ScanBy: "TimestampAscending",
      }),
    ),
  ]);
  const db = d.DBInstances?.[0];
  const series = (id: string) => m.MetricDataResults?.find((r) => r.Id === id)?.Values ?? [];
  return {
    status: db?.DBInstanceStatus ?? "unknown",
    instanceClass: db?.DBInstanceClass ?? "",
    engine: `${db?.Engine ?? ""} ${db?.EngineVersion ?? ""}`.trim(),
    storageGb: db?.AllocatedStorage ?? 0,
    encrypted: !!db?.StorageEncrypted,
    multiAz: !!db?.MultiAZ,
    public: !!db?.PubliclyAccessible,
    backupDays: db?.BackupRetentionPeriod ?? 0,
    latestRestorable: db?.LatestRestorableTime?.toISOString() ?? null,
    deletionProtection: !!db?.DeletionProtection,
    cpu: series("m0").map((v) => Math.round(v * 10) / 10),
    freeStorageGb: series("m1").map((v) => Math.round((v / 1024 ** 3) * 10) / 10),
    connections: series("m2").map((v) => Math.round(v)),
  };
}

// ---------- security findings ----------
export type Finding = { id: string; title: string; severity: number; type: string; updatedAt: string; count: number };
export async function getSecurityFindings(): Promise<Finding[]> {
  const list = await gd().send(
    new ListFindingsCommand({
      DetectorId: DETECTOR_ID,
      FindingCriteria: { Criterion: { "service.archived": { Eq: ["false"] }, severity: { Gte: 2 } } },
      SortCriteria: { AttributeName: "updatedAt", OrderBy: "DESC" },
      MaxResults: 20,
    }),
  );
  if (!list.FindingIds?.length) return [];
  const got = await gd().send(new GetFindingsCommand({ DetectorId: DETECTOR_ID, FindingIds: list.FindingIds }));
  return (got.Findings ?? []).map((f) => ({
    id: f.Id ?? "",
    title: f.Title ?? f.Type ?? "",
    severity: f.Severity ?? 0,
    type: f.Type ?? "",
    updatedAt: f.UpdatedAt ?? "",
    count: f.Service?.Count ?? 1,
  }));
}

// ---------- schedules ----------
export async function getScheduleState(rule: string): Promise<"ENABLED" | "DISABLED" | string> {
  const r = await eb().send(new DescribeRuleCommand({ Name: rule }));
  return r.State ?? "unknown";
}
export async function setScheduleEnabled(rule: string, enabled: boolean): Promise<void> {
  await eb().send(enabled ? new EnableRuleCommand({ Name: rule }) : new DisableRuleCommand({ Name: rule }));
}
