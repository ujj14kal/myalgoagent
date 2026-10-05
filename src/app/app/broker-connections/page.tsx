import { Link2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import PageHeader from "@/components/ui/page-header";
import BrokerConnections, { type ConnectionView } from "@/components/broker-connections";
import { BROKERS, brokerById } from "@/lib/brokers/catalog";
import { callbackOrigin, notifierUrlFor } from "@/lib/brokers/service";
import { brokerEncryptionReady } from "@/lib/brokers/crypto";
import { decodeFailure } from "@/lib/brokers/failures";
import { dataAccess, type DataAccess } from "@/lib/brokers/data-access";
import type { BrokerId } from "@/lib/brokers/catalog";

export const metadata = { title: "Broker Connections", robots: { index: false } };

const istTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<{ broker?: string; result?: string; edit?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { broker, result, edit } = await searchParams;

  let rows: Awaited<ReturnType<typeof prisma.brokerConnection.findMany>> = [];
  let storageReady = brokerEncryptionReady();
  try {
    rows = await prisma.brokerConnection.findMany({ where: { userId: session.user.id } });
  } catch (err) {
    // Table not created yet on this environment — the guides still work.
    logError("brokerConnections.page", err);
    storageReady = false;
  }

  const now = new Date();
  // Only display-safe fields cross to the browser — never keys or tokens.
  // Market data access is checked through each logged-in connection (one small read, cached for hours).
  const access = new Map<string, DataAccess>();
  await Promise.all(
    rows
      .filter((r) => r.status === "CONNECTED" && r.tokenExpiresAt && r.tokenExpiresAt > now)
      .map(async (r) => {
        const a = await dataAccess(session.user!.id!, r.broker as BrokerId).catch(() => null);
        if (a) access.set(r.broker, a);
      }),
  );
  const connections: ConnectionView[] = rows.map((r) => {
    const sessionLive = r.status === "CONNECTED" && !!r.tokenExpiresAt && r.tokenExpiresAt > now;
    return {
      data: access.get(r.broker) ?? null,
      broker: r.broker,
      state: sessionLive ? "connected" : r.status === "CONNECTED" ? "expired" : r.status === "ERROR" ? "error" : "keys_saved",
      apiKeyHint: r.apiKeyHint,
      accountName: r.accountName,
      brokerClientId: r.brokerClientId,
      sessionUntil: sessionLive && r.tokenExpiresAt ? istTime(r.tokenExpiresAt) : null,
      lastCheckedAt: r.lastCheckedAt ? istTime(r.lastCheckedAt) : null,
      failure: decodeFailure(r.lastError),
      loginMethod: r.loginMethod === "totp" || r.loginMethod === "phone" ? r.loginMethod : null,
    };
  });

  const selected = brokerById(broker ?? "")?.id ?? connections[0]?.broker ?? "dhan";

  return (
    <div>
      <PageHeader
        title="Broker Connections"
        icon={Link2}
        description="Link your own broker account through the broker's official API. You create the API app, you log in at your broker, and your keys stay encrypted on our servers."
      />
      <BrokerConnections
        brokers={BROKERS}
        connections={connections}
        origin={callbackOrigin()}
        initialBroker={selected}
        startEditing={edit === "1"}
        signedOut={result === "signed_out"}
        storageReady={storageReady}
        notifierUrl={storageReady ? notifierUrlFor(session.user.id) : null}
      />
    </div>
  );
}
