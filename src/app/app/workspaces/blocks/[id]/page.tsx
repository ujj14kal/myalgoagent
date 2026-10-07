import { notFound } from "next/navigation";
import { Blocks } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import BlockEditor from "@/components/system/block-editor";
import { conceptBlockIds, parseBlockDefinition, parseConceptDefinition } from "@/lib/system/definition";

export const metadata = { title: "Block", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BlockPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const { id } = await params;
  const block = await prisma.block.findFirst({ where: { id, userId } });
  if (!block) notFound();
  const def = parseBlockDefinition(block.definition);
  const concepts = await prisma.concept.findMany({ where: { userId }, select: { id: true, name: true, definition: true } });
  const usedBy = concepts.filter((c) => conceptBlockIds(parseConceptDefinition(c.definition)?.logic ?? null).includes(id)).map((c) => ({ id: c.id, name: c.name }));
  return (
    <div>
      <PageHeader eyebrow="Workspace · Block" title={block.name} icon={Blocks} description="A reusable market component. Concepts combine blocks; trading systems decide what to trade." />
      <BlockEditor id={block.id} initialName={block.name} initialDescription={block.description ?? ""} initialCondition={def?.condition} initialTimeframe={def?.timeframe ?? null} usedBy={usedBy} />
    </div>
  );
}
