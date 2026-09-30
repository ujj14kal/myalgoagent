import { brokerById } from "@/lib/brokers/catalog";
import { LIVE_BROKERS } from "@/lib/brokers/live-brokers";

/** Each connected broker that can take live orders: logged in today, and checked ready in the last 24 hours. */
export function brokerReadiness(conns: { broker: string; status: string; tokenExpiresAt: Date | null; liveReadyAt: Date | null }[], nowMs = Date.now()) {
  return conns
    .filter((c) => LIVE_BROKERS[c.broker as keyof typeof LIVE_BROKERS])
    .map((c) => {
      const loggedIn = c.status === "CONNECTED" && !!c.tokenExpiresAt && c.tokenExpiresAt.getTime() > nowMs;
      return { id: c.broker, name: brokerById(c.broker)?.name ?? c.broker, loggedIn, ready: loggedIn && !!c.liveReadyAt && nowMs - c.liveReadyAt.getTime() < 24 * 3_600_000 };
    });
}
