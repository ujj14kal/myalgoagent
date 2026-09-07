export default function LoadingSpinner({ full = true }: { full?: boolean }) {
  return (
    <div
      className={full ? "flex min-h-[50vh] items-center justify-center" : "flex items-center justify-center py-10"}
      role="status"
      aria-label="Loading"
    >
      <div className="brand-spinner" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
