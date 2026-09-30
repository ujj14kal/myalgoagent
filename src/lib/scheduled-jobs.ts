import "server-only";
import { logError } from "@/lib/logger";
import { runScheduledPaperSync } from "@/lib/paper/scheduled-sync";
import { runScheduledOptionForwardTests } from "@/lib/options/forward-runner";
import { runAccountPurge } from "@/lib/account-purge";
import { syncInstrumentUniverse } from "@/lib/instruments/sync-universe";
import { runLiveDeployments } from "@/lib/live/deployments";

// What each scheduled job does — shared by the EventBridge-triggered routes and
// the admin portal's "Run now", so both always do the same thing.

/** Every 5 min in market hours: live strategies first (real orders are time-sensitive), then equity and options forward tests. */
export async function runMarketHoursJob() {
  const live = await runLiveDeployments(20_000).catch((err) => {
    logError("live.deployments.scheduled", err);
    return null;
  });
  const equity = await runScheduledPaperSync();
  const options = await runScheduledOptionForwardTests(20_000).catch((err) => {
    logError("options.forward.scheduled", err);
    return { total: 0, checked: 0, failed: -1, ms: 0 };
  });
  return { ...equity, options, live };
}

/** Daily: purge accounts past their deletion date, then add newly listed NSE stocks. */
export async function runDailyJob() {
  const purge = await runAccountPurge();
  const instruments = await syncInstrumentUniverse().catch((err) => {
    logError("instruments.sync", err);
    return { listed: 0, added: -1 };
  });
  return { ...purge, instruments };
}
