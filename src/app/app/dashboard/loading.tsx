// The dashboard's own shape while its numbers load: the briefing banner, the cards and the two columns below, so the real
// content fills in place with no jump.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading your dashboard" className="space-y-6">
      <div className="skeleton h-40 w-full rounded-3xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="skeleton h-56 lg:col-span-2" />
        <div className="skeleton h-56" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
