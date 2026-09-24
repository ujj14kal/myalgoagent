/** Small gold pill marking a capability that's planned but not built yet. */
export default function ComingSoonTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-brand-gold/15 px-2.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[#8a7437] ${className}`}
    >
      Coming soon
    </span>
  );
}

/** A muted bullet list of planned items, headed by the Coming soon tag. */
export function ComingSoonList({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <div className={`mt-4 rounded-xl border border-dashed border-brand-gold/40 bg-brand-gold/[0.04] p-4 ${className}`}>
      <ComingSoonTag />
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="relative pl-5 text-sm leading-relaxed text-brand-navy/55">
            <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full border border-brand-gold" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
