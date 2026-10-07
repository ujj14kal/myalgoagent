import { Boxes } from "lucide-react";
import { auth } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import ConceptEditor from "@/components/system/concept-editor";
import { loadBlockOptions } from "@/lib/system/options";

export const metadata = { title: "New concept", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewConceptPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return (
    <div>
      <PageHeader eyebrow="Workspace · Concepts" title="New concept" icon={Boxes} description="Combine your blocks into one setup and classify it bullish or bearish. A concept only says “setup valid” — the trading system decides what to do with it." />
      <ConceptEditor blocks={await loadBlockOptions(userId)} />
    </div>
  );
}
