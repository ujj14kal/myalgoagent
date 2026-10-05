import "server-only";
import { logError } from "@/lib/logger";
import { runScheduledPaperSync } from "@/lib/paper/scheduled-sync";
import { runScheduledOptionForwardTests } from "@/lib/options/forward-runner";
import { runAccountPurge } from "@/lib/account-purge";
import { syncInstrumentUniverse } from "@/lib/instruments/sync-universe";
import { runLiveDeployments } from "@/lib/live/deployments";
import { engineAlive } from "@/lib/live/engine-heartbeat";
import { runBrokerKeepAlive } from "@/lib/brokers/keepalive";

// What each scheduled job does — shared by the EventBridge-triggered routes and
// the admin portal's "Run now", so both always do the same thing.

/** Every minute in market hours: the user's live strategies, which send real orders (time-sensitive, so on their own schedule). */
export async function runLiveJob() {
  // The always-on engine does this work when it is healthy; this is the cheap backup that takes over if it stops.
  if (await engineAlive()) return { skipped: "engine running", total: 0, acted: 0, failed: 0 };
  return runLiveDeployments(45_000);
}

/** Every 5 min in market hours: equity forward tests, then options forward tests. */
export async function runMarketHoursJob() {
  const equity = await runScheduledPaperSync();
  const options = await runScheduledOptionForwardTests(20_000).catch((err) => {
    logError("options.forward.scheduled", err);
    return { total: 0, checked: 0, failed: -1, ms: 0 };
  });
  const brokers = await runBrokerKeepAlive().catch((err) => {
    logError("broker.keepalive", err);
    return null;
  });
  return { ...equity, options, brokers };
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
