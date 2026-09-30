import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { describeFailure } from "@/lib/brokers/failures";
import { brokerById } from "@/lib/brokers/catalog";
import { currentEgressIp, registeredStaticIp } from "@/lib/brokers/egress";
import { ACCOUNT_READERS } from "@/lib/brokers/account-data";
import { LIVE_BROKERS } from "@/lib/brokers/live-brokers";
import { nseEquity } from "@/lib/brokers/nse-lookup";
import { LiveCheckError, session } from "./orders";

// "Ready to go live?" — checks every part of the order path WITHOUT placing an
// order: the broker session, read access through the static IP, the IP brokers
// actually see, order-book access and the stock list. Read-only calls only.

export type ReadinessStep = { step: string; ok: boolean; detail?: string };
export type Readiness = { ready: boolean; steps: ReadinessStep[]; checkedAt: string };

const msg = (err: unknown, broker: string) =>
  err instanceof BrokerError ? (err.failure.detail ?? describeFailure(err.failure, broker).title) : err instanceof LiveCheckError ? err.message : "No answer";

export async function checkReadiness(userId: string, brokerId: string): Promise<Readiness> {
  const name = brokerById(brokerId)?.name ?? brokerId;
  const steps: ReadinessStep[] = [];
  const add = (step: string, ok: boolean, detail?: string) => steps.push({ step, ok, detail });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { liveTradingEnabledAt: true, liveStaticIp: true, status: true } });
  add("Live trading switched on for your account", !!user?.liveTradingEnabledAt && user.status === "ACTIVE", user?.liveTradingEnabledAt ? undefined : "Ask MyAlgoAgent to switch it on for your account.");

  const adapter = LIVE_BROKERS[brokerId as keyof typeof LIVE_BROKERS];
  add(`${name} supports orders from MyAlgoAgent`, !!adapter, adapter ? (adapter.fno ? "Stocks and F&O" : "Stocks") : "Not yet available for this broker.");

  let ctx: Awaited<ReturnType<typeof session>> | null = null;
  try {
    ctx = await session(userId, brokerId);
    add(`Logged in to ${name} for today`, true);
  } catch (err) {
    add(`Logged in to ${name} for today`, false, msg(err, name));
  }

  const expected = registeredStaticIp(user?.liveStaticIp);
  try {
    const { ip, viaRelay } = await currentEgressIp();
    add("Orders leave from your static IP", !!expected && ip === expected, expected ? `Brokers see ${ip}${ip === expected ? "" : ` — expected ${expected}`}` : `No static IP is assigned to your account yet${viaRelay ? "" : ` (brokers see ${ip}, which changes)`}.`);
  } catch {
    add("Orders leave from your static IP", false, "Couldn't reach the static-IP route.");
  }

  const reader = ACCOUNT_READERS[brokerId as keyof typeof ACCOUNT_READERS];
  if (ctx && reader) {
    if (reader.funds || reader.profile) {
      try {
        // Only whether it answered is kept — never the account details themselves.
        if (reader.funds) await reader.funds(ctx);
        else await reader.profile!(ctx);
        add(`${name} answers through the static IP`, true);
      } catch (err) {
        add(`${name} answers through the static IP`, false, msg(err, name));
      }
    }
    if (reader.orders) {
      try {
        await reader.orders(ctx);
        add("Can read your order book", true);
      } catch (err) {
        add("Can read your order book", false, msg(err, name));
      }
    }
  } else if (ctx) {
    add(`${name} answers through the static IP`, false, "Reading this broker's account isn't available yet.");
  }

  try {
    add("NSE stock list loaded", !!(await nseEquity("RELIANCE")));
  } catch {
    add("NSE stock list loaded", false, "Couldn't load the exchange's stock list.");
  }

  const ready = steps.every((s) => s.ok);
  const result: Readiness = { ready, steps, checkedAt: new Date().toISOString() };
  await prisma.brokerConnection
    .update({ where: { userId_broker: { userId, broker: brokerId } }, data: { liveReadyAt: ready ? new Date() : null, liveReadyDetail: result as unknown as Prisma.InputJsonValue } })
    .catch((err) => logWarn("live.readiness", "couldn't store result", { error: String(err) }));
  return result;
}
