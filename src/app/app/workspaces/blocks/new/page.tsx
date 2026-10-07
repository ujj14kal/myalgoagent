import { Blocks } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import BlockEditor from "@/components/system/block-editor";

export const metadata = { title: "New block", robots: { index: false } };

export default function NewBlockPage() {
  return (
    <div>
      <PageHeader eyebrow="Workspace · Blocks" title="New block" icon={Blocks} description="Define one market component once — a break of structure, a fair value gap, a level, a session — and reuse it in any concept." />
      <BlockEditor />
    </div>
  );
}
