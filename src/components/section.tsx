export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <section className="mk-section mk-tint !pt-16 sm:!pt-24">
      <div className="mk-wrap">
        <div className="mk-card mk-prose mx-auto max-w-3xl sm:!p-12" data-rise>
          {children}
        </div>
      </div>
    </section>
  );
}

export function Callout({
  children,
  tone = "navy",
}: {
  children: React.ReactNode;
  tone?: "navy" | "gold";
}) {
  const toneClasses = tone === "gold" ? "bg-[rgba(189,163,96,0.12)] shadow-[inset_0_0_0_1px_rgba(189,163,96,0.35)]" : "bg-[rgba(71,24,152,0.06)] shadow-[inset_0_0_0_1px_rgba(71,24,152,0.14)]";
  return <div className={`mt-6 rounded-[var(--mk-r-sm)] ${toneClasses} px-5 py-4 text-sm leading-relaxed text-[var(--mk-ink-soft)]`}>{children}</div>;
}

export function Breadcrumbs({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mk-wrap pt-24 text-sm text-[var(--mk-ink-soft)]">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={item.href} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {i === items.length - 1 ? (
              <span className="text-brand-navy/70">{item.label}</span>
            ) : (
              <a href={item.href} className="hover:text-brand-primary">
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
