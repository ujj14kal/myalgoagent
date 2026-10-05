import "server-only";
import type { BrokerConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { BrokerError } from "./adapters";
import { brokerById } from "./catalog";
import { accessTokenOf, credsOf, failureOf, liveAdapter, saveError, saveSession } from "./service";
import { renewalDue, needsMorningLogin, checkDue, canRenewUnattended } from "./keepalive-rules";
import { inMarketWindow } from "@/lib/paper/market-window";

// Keeps each user's broker session alive without them doing anything, as far
// as the brokers allow. Most brokers require the account holder to log in
// themselves each day (their rule, not ours), so the honest split is:
//  - Groww with the TOTP key: we sign in again ourselves, shortly before the
//    session ends, so it never lapses.
//  - Every other broker: we check the session is still accepted, tell the
//    user the moment it isn't, and remind them to log in before the market opens.

export { canRenewUnattended } from "./keepalive-rules";

const stillValid = (row: Pick<BrokerConnection, "status" | "tokenExpiresAt">) => row.status === "CONNECTED" && !!row.tokenExpiresAt && row.tokenExpiresAt.getTime() > Date.now();

async function notify(userId: string, message: string, dayStart: Date) {
  const dup = await prisma.notification.findFirst({ where: { userId, message, createdAt: { gte: dayStart } }, select: { id: true } });
  if (dup) return;
  await prisma.notification.create({ data: { userId, type: "SIGNAL_ALERT", message, link: "/app/broker-connections" } }).catch(() => {});
}

/** Sign in again for a broker that allows it without the user. True when a fresh session was saved. */
export async function renewUnattended(row: BrokerConnection): Promise<boolean> {
  const live = liveAdapter(row.broker);
  if (!live || !canRenewUnattended(row)) return false;
  const keepSession = stillValid(row);
  try {
    const s = await live.adapter.exchange(credsOf(row), new URLSearchParams(), "");
    await saveSession(row, s);
    return true;
  } catch (err) {
    if (!(err instanceof BrokerError)) logError("broker.renew", err, { userId: row.userId, broker: row.broker });
    await saveError(row.id, err, { keepSession });
    return false;
  }
}

/** One pass over every connection: renew what can be renewed, verify what's live, remind about the rest. */
export async function runBrokerKeepAlive(now = new Date()) {
  const rows = await prisma.brokerConnection.findMany({ where: { status: { in: ["CONNECTED", "ERROR", "KEYS_SAVED"] }, apiKeyEnc: { not: "" } } });
  const out = { renewed: 0, renewFailed: 0, checked: 0, dropped: 0, reminded: 0 };
  for (const row of rows) {
    try {
      if (canRenewUnattended(row)) {
        if (renewalDue(row, now)) {
          if (await renewUnattended(row)) out.renewed++;
          else out.renewFailed++;
        }
        continue;
      }
      const live = liveAdapter(row.broker);
      if (stillValid(row) && live && checkDue(row, now) && inMarketWindow(now)) {
        const token = accessTokenOf(row);
        if (!token) continue;
        out.checked++;
        try {
          await live.adapter.profile(credsOf(row), token);
          await prisma.brokerConnection.update({ where: { id: row.id }, data: { lastCheckedAt: now, lastError: null } });
        } catch (err) {
          // A broker that is merely unreachable keeps its session; only a session the broker itself refuses is dropped.
          const f = failureOf(err);
          if (f.code === "session_rejected" || f.code === "session_ended") {
            await saveError(row.id, err);
            out.dropped++;
            const name = brokerById(row.broker)?.name ?? row.broker;
            await notify(row.userId, `${name} ended your session. Log in again so your strategies can keep trading.`, new Date(now.getTime() - 6 * 3_600_000));
          }
        }
      } else if (needsMorningLogin(row, now)) {
        const active = await prisma.liveDeployment.count({ where: { userId: row.userId, broker: row.broker, status: "ACTIVE" } });
        if (active > 0) {
          const name = brokerById(row.broker)?.name ?? row.broker;
          await notify(row.userId, `Log in to ${name} for today — your live strategies can't trade until you do.`, new Date(now.getTime() - 6 * 3_600_000));
          out.reminded++;
        }
      }
    } catch (err) {
      logWarn("broker.keepalive", "row failed", { broker: row.broker, error: String(err) });
    }
  }
  return out;
}
