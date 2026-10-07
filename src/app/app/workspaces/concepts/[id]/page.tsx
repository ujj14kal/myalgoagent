import { notFound } from "next/navigation";
import { Boxes } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import ConceptEditor from "@/components/system/concept-editor";
import { parseConceptClass, parseConceptDefinition, parseSystemDefinition } from "@/lib/system/definition";
import { loadBlockOptions } from "@/lib/system/options";

export const metadata = { title: "Concept", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const { id } = await params;
  const concept = await prisma.concept.findFirst({ where: { id, userId } });
  if (!concept) notFound();
  const [blocks, systems] = await Promise.all([loadBlockOptions(userId), prisma.workspace.findMany({ where: { userId }, select: { id: true, name: true, draft: true } })]);
  const usedBy = systems.filter((s) => parseSystemDefinition(s.draft)?.concepts.some((c) => c.conceptId === id)).map((s) => ({ id: s.id, name: s.name }));
  return (
    <div>
      <PageHeader eyebrow="Workspace · Concept" title={concept.name} icon={Boxes} description="Blocks combined into one setup. It never trades on its own: trading systems that use it make every trading decision." />
      <ConceptEditor
        id={concept.id}
        initialName={concept.name}
        initialDescription={concept.description ?? ""}
        initialClassification={parseConceptClass(concept.classification)}
        initialLogic={parseConceptDefinition(concept.definition)?.logic ?? null}
        blocks={blocks}
        usedBy={usedBy}
      />
    </div>
  );
}
