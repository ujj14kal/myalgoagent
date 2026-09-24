import AgentAvatar from "@/components/ui/agent-avatar";

// Shown inside the app shell while a page's data loads: the page's own
// structure as shimmer, so content fills in place instead of jumping.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="space-y-6">
      <div className="flex items-center gap-3">
        <AgentAvatar pose="thinking" size={36} />
        <p className="text-sm font-medium text-brand-navy/55">Fetching your latest data…</p>
      </div>
      <div className="skeleton h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="skeleton h-72 lg:col-span-2" />
        <div className="skeleton h-72" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
