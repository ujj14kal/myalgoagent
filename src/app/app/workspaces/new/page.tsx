import { Network } from "lucide-react";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import NewWorkspaceForm from "@/components/workspace/new-workspace-form";

export const metadata = { title: "New trading system", robots: { index: false } };

export default async function NewWorkspacePage() {
  const instruments = await prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } });
  const fallback = (instruments.find((i) => i.symbol === "RELIANCE.NS") ?? instruments.find((i) => !i.symbol.startsWith("^")) ?? instruments[0])?.id ?? "";
  return (
    <div>
      <PageHeader eyebrow="Workspace · Trading systems" title="New trading system" icon={Network} description="Name it and pick what it trades. On the next screen you add concepts and make every trading decision: timeframes, sessions, capital, sizing, leverage, risk, conflicts and execution." />
      <NewWorkspaceForm instruments={instruments} defaultInstrumentId={fallback} />
    </div>
  );
}
