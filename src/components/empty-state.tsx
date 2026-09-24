import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";

export default function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
  pose = "point",
}: {
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  pose?: AgentPose;
}) {
  return (
    <div className="surface flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Agent2D pose={pose} size={110} />
      <p className="mt-1 text-base font-semibold text-brand-navy">{title}</p>
      {description && <p className="max-w-md text-sm text-brand-navy/55">{description}</p>}
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="group mt-3 inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-light"
        >
          {ctaLabel}
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
