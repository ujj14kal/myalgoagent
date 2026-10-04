// The always-on engine for live strategies, run as a service on AWS Fargate.
// It does what the every-minute Amplify job does — but every ~15 seconds, all day —
// and reports a heartbeat so the Amplify job can stand aside while it is healthy.

const INTERVAL_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));

async function main() {
  process.env.APP_SECRETS_PATH ??= "/myalgoagent/app";
  const { ensureRuntimeSecrets } = await import("@/lib/runtime-secrets");
  await ensureRuntimeSecrets();
  if (!process.env.DATABASE_URL) throw new Error("Secrets didn't load (no DATABASE_URL).");

  // Imported only now: the database client reads its settings at import time.
  const { runLiveDeployments } = await import("@/lib/live/deployments");
  const { recordEngineBeat } = await import("@/lib/live/engine-heartbeat");
  const { inMarketWindow } = await import("@/lib/paper/market-window");
  const { logError } = await import("@/lib/logger");
  const { logForActiveUsers, pruneEngineLog } = await import("@/lib/live/engine-log");
  const { egressEnabled, currentEgressIp } = await import("@/lib/brokers/egress");

  if (process.env.ENGINE_DRY_RUN === "1") {
    const { prisma } = await import("@/lib/prisma");
    log("dry run: not checking anything", { active: await prisma.liveDeployment.count({ where: { status: "ACTIVE" } }), viaRelay: egressEnabled() });
    await prisma.$disconnect();
    return;
  }

  let stop = false;
  process.on("SIGTERM", () => {
    stop = true;
    log("stopping");
  });
  const ip = await currentEgressIp().catch(() => null);
  log("engine started", { viaRelay: egressEnabled(), brokersSeeIp: ip?.ip ?? null, everyMs: INTERVAL_MS });

  await logForActiveUsers("INFO", "The live engine started. It checks your running strategies every 15 seconds while the market is open.");
  let wasOpen: boolean | null = null;
  let prunedDay = "";
  while (!stop) {
    const started = Date.now();
    try {
      const open = inMarketWindow(new Date());
      if (wasOpen !== null && open !== wasOpen) await logForActiveUsers("INFO", open ? "The market is open. Your running strategies are being watched every 15 seconds." : "The market is closed. The engine rests until the next session; no orders are sent.");
      wasOpen = open;
      const day = new Date().toISOString().slice(0, 10);
      if (day !== prunedDay) {
        prunedDay = day;
        await pruneEngineLog(14).catch(() => 0);
      }
      if (open) {
        const r = await runLiveDeployments(40_000);
        await recordEngineBeat({ total: r.total, acted: r.acted, failed: r.failed });
        if (r.acted || r.failed) log("pass", r);
      } else {
        await recordEngineBeat({ total: 0, acted: 0, failed: 0 }); // alive, market closed
      }
    } catch (err) {
      logError("engine.pass", err);
    }
    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - started)));
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ at: new Date().toISOString(), msg: "engine crashed", error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
