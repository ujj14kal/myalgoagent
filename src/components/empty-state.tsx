import Link from "next/link";
import RobotMascot, { type RobotPose } from "@/components/robot/robot-mascot";

export default function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
  pose = "idle",
}: {
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  pose?: RobotPose;
}) {
  return (
    <div className="hover-lift flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-navy/15 bg-white p-12 text-center">
      <RobotMascot pose={pose} size={80} />
      <p className="text-sm font-semibold text-brand-navy">{title}</p>
      {description && <p className="max-w-sm text-sm text-brand-navy/50">{description}</p>}
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="mt-1 text-sm font-medium text-brand-primary hover:underline">
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}
