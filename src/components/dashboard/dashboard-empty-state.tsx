import Link from "next/link";
import RobotMascot from "@/components/robot/robot-mascot";

export default function DashboardEmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="hover-lift flex flex-col items-center gap-4 rounded-2xl border border-dashed border-brand-navy/15 bg-white p-10 text-center">
      <RobotMascot pose="point" size={90} />
      <div>
        <p className="text-sm font-semibold text-brand-navy">
          {agentName} here — you haven&rsquo;t built a strategy yet.
        </p>
        <p className="mt-1 text-sm text-brand-navy/50">
          Build one visually or with code, then backtest it and start a paper session to see this
          dashboard fill in.
        </p>
      </div>
      <Link
        href="/app/strategies/new"
        className="rounded-full bg-brand-primary px-5 py-2 text-sm font-medium text-white hover:bg-brand-primary-light"
      >
        Create your first strategy
      </Link>
    </div>
  );
}
