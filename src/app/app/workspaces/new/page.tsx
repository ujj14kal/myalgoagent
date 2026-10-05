import { Network } from "lucide-react";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import NewWorkspaceForm from "@/components/workspace/new-workspace-form";

export const metadata = { title: "New Workspace", robots: { index: false } };

export default async function NewWorkspacePage() {
  const instruments = await prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } });
  const fallback = (instruments.find((i) => i.symbol === "RELIANCE.NS") ?? instruments.find((i) => !i.symbol.startsWith("^")) ?? instruments[0])?.id ?? "";
  return (
    <div>
      <PageHeader title="New Workspace" icon={Network} description="Name it and pick what it trades. You add strategies, connect their rules and set the entries and exits on the next screen." />
      <NewWorkspaceForm instruments={instruments} defaultInstrumentId={fallback} />
    </div>
  );
}
