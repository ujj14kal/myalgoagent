// Read-only check before the market opens: is everything ready for live orders?
//   AWS_PROFILE=myalgoagent npx tsx --conditions=react-server scripts/preopen-check.ts
// Prints no secrets and changes nothing.
export {}; // makes this file a module, so its helpers don't clash with the engine's
process.env.APP_SECRETS_PATH ??= "/myalgoagent/app";

const IST = (d: Date | null) => (d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) : "never");
const ok = (good: boolean, text: string) => console.log(`${good ? "✅" : "❌"} ${text}`);
const info = (text: string) => console.log(`   ${text}`);

async function main() {
  const { ensureRuntimeSecrets } = await import("@/lib/runtime-secrets");
  await ensureRuntimeSecrets();
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  console.log(`Pre-open check — ${IST(now)} IST\n`);

  const beat = await prisma.jobRun.findFirst({ where: { job: "engine:live" }, select: { finishedAt: true, summary: true } });
  const age = beat?.finishedAt ? Math.round((now.getTime() - beat.finishedAt.getTime()) / 1000) : null;
  ok(age !== null && age < 60, `Engine heartbeat: ${age === null ? "none" : `${age}s ago`} (needs < 60s; the engine rests outside market hours but still reports)`);

  const conns = await prisma.brokerConnection.findMany({ select: { userId: true, broker: true, status: true, tokenExpiresAt: true, liveReadyAt: true, liveReadyDetail: true } });
  for (const c of conns) {
    const left = c.tokenExpiresAt ? (c.tokenExpiresAt.getTime() - now.getTime()) / 3_600_000 : null;
    ok(c.status === "CONNECTED" && left !== null && left > 0.5, `${c.broker} (${c.userId.slice(-6)}): ${c.status}, token ${left === null ? "none" : left > 0 ? `valid ${left.toFixed(1)} h more (until ${IST(c.tokenExpiresAt)} IST)` : "EXPIRED — reconnect before the open"}`);
    const r = c.liveReadyDetail as { checks?: { ok: boolean; label: string; detail?: string }[] } | null;
    if (r?.checks) for (const k of r.checks.filter((x) => !x.ok)) info(`readiness: ${k.label} — ${k.detail ?? ""}`);
    info(`last readiness check: ${IST(c.liveReadyAt)} IST`);
  }

  const risk = await prisma.riskSettings.findMany({ select: { userId: true, killSwitchEnabled: true, liveMaxOrderValue: true } });
  for (const r of risk.filter((x) => x.killSwitchEnabled)) ok(false, `Kill switch is ON for user …${r.userId.slice(-6)} — no new entries will be sent`);

  const deps = await prisma.liveDeployment.findMany({ where: { status: { not: "STOPPED" } }, orderBy: { startedAt: "asc" } });
  console.log(`\nLive strategies (${deps.length}):`);
  for (const d of deps) {
    const st = d.engineState as unknown as { startingCapital?: number; cash?: number } | null;
    ok(d.status === "ACTIVE", `${d.strategyName} on ${d.instrumentSymbol} via ${d.broker}: ${d.status}, ${d.mode}, capital ₹${st?.startingCapital ?? "?"}, last check ${IST(d.lastCheckedAt)}${d.lastError ? ` — error: ${d.lastError}` : ""}`);
  }

  const orders = await prisma.liveOrder.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, side: true, quantity: true, tradingSymbol: true, status: true, rejectReason: true } });
  console.log("\nLast orders:");
  for (const o of orders) info(`${IST(o.createdAt)} ${o.side} ${o.quantity} ${o.tradingSymbol} — ${o.status}${o.rejectReason ? ` (${o.rejectReason})` : ""}`);

  const logs = await prisma.liveEngineLog.count();
  info(`engine log table reachable (${logs} lines)`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
