import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { brokerById } from "@/lib/brokers/catalog";
import BrokerConnecting from "@/components/broker-connecting";

export const metadata = { title: "Connecting your broker", robots: { index: false } };
export const dynamic = "force-dynamic";

// Where the broker's Redirect URL lands (via /api/brokers/[broker]/callback).
// The screen finishes the login and shows the outcome.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ broker: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const broker = brokerById((await params).broker);
  if (!broker || broker.availability !== "live") notFound();

  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") query[k] = v;
  }
  const row = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId: session.user.id, broker: broker.id } }, select: { loginMethod: true } });
  const method = row?.loginMethod === "totp" || row?.loginMethod === "phone" ? row.loginMethod : null;
  return <BrokerConnecting broker={broker} query={query} method={method} />;
}
