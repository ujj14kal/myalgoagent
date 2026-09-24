import Agent2D from "@/components/robot/agent-2d";
import PageHeader from "@/components/ui/page-header";
import type { LucideIcon } from "lucide-react";

export default function ComingSoon({
  title,
  icon,
  description,
  points = [],
}: {
  title: string;
  icon?: LucideIcon;
  description?: string;
  points?: string[];
}) {
  return (
    <div>
      <PageHeader title={title} icon={icon} eyebrow="In development" />
      <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
        <Agent2D pose="working" size={130} />
        <p className="mt-1 text-lg font-semibold text-brand-navy">Being built right now</p>
        <p className="max-w-md text-sm text-brand-navy/55">
          {description ??
            "This section is next on the build list. Your account and everything else already works — this page just isn't wired up yet."}
        </p>
        {points.length > 0 && (
          <ul className="mt-3 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 rounded-xl border border-black/[0.06] bg-brand-bg/60 px-3 py-2 text-sm text-brand-navy/70">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary/50" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
