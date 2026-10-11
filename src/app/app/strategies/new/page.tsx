import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { loadSavedBlocks } from "@/lib/system/saved-blocks-server";
import { SavedBlocksProvider } from "@/components/system/saved-blocks";
import NewStrategyWithDraft from "@/components/new-strategy-draft";
import { Layers } from "lucide-react";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "New Strategy", robots: { index: false } };

export default async function NewStrategyPage() {
  const session = await auth();
  const [instruments, blocks] = await Promise.all([
    prisma.instrument.findMany({
      orderBy: { symbol: "asc" },
      select: { id: true, symbol: true, name: true },
    }),
    session?.user?.id ? loadSavedBlocks(session.user.id).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader title="New Strategy" icon={Layers} description={<>Build your entry and exit rules visually, or write them as code — both are evaluated identically.</>} />
      <div className="mt-6">
        <SavedBlocksProvider value={blocks}>
          <NewStrategyWithDraft instruments={instruments} />
        </SavedBlocksProvider>
      </div>
    </div>
  );
}
