import { Blocks } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import DescribeBlock from "@/components/system/describe-block";

export const metadata = { title: "New block", robots: { index: false } };

export default function NewBlockPage() {
  return (
    <div>
      <PageHeader eyebrow="Workspace · Blocks" title="New block" icon={Blocks} description="Describe one market component — a break of structure, a fair value gap, a level, a session — and your assistant builds it for you to review. Reuse it in any concept or strategy." />
      <DescribeBlock />
    </div>
  );
}
