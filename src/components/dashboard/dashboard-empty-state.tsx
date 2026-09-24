import EmptyState from "@/components/empty-state";

export default function DashboardEmptyState({ agentName }: { agentName: string }) {
  return (
    <EmptyState
      pose="point"
      title={`${agentName} here — let's build your first strategy.`}
      description="Build one visually or with code, backtest it on real history, then start a paper session to see this dashboard fill in."
      ctaLabel="Create your first strategy"
      ctaHref="/app/strategies/new"
    />
  );
}
