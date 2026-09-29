import "server-only";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_READERS } from "./account-data";
import { brokerById } from "./catalog";

/** Brokers the user is logged in to today whose account data we can read. */
export async function readableBrokers(userId: string): Promise<{ id: string; name: string }[]> {
  const now = new Date();
  const conns = await prisma.brokerConnection.findMany({ where: { userId, status: "CONNECTED", tokenExpiresAt: { gt: now } }, select: { broker: true }, orderBy: { createdAt: "asc" } });
  return conns.filter((c) => ACCOUNT_READERS[c.broker as keyof typeof ACCOUNT_READERS]).map((c) => ({ id: c.broker, name: brokerById(c.broker)?.name ?? c.broker }));
}
