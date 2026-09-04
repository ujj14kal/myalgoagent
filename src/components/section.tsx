export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 [&>h2]:mt-12 [&>h2]:border-t [&>h2]:border-black/5 [&>h2]:pt-10 [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:text-brand-navy [&>h2:first-child]:mt-0 [&>h2:first-child]:border-t-0 [&>h2:first-child]:pt-0 [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:text-brand-navy [&>p]:mt-3 [&>p]:leading-relaxed [&>p]:text-brand-navy/75 [&>ul]:mt-3 [&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-6 [&>ul]:text-brand-navy/75 [&_a]:text-brand-primary [&_a]:underline [&_a]:underline-offset-2">
      {children}
    </div>
  );
}

export function Callout({
  children,
  tone = "navy",
}: {
  children: React.ReactNode;
  tone?: "navy" | "gold";
}) {
  const toneClasses =
    tone === "gold"
      ? "border-brand-gold bg-brand-gold/10"
      : "border-brand-navy bg-brand-navy/5";
  return (
    <div className={`mt-6 rounded-xl border-l-4 ${toneClasses} px-5 py-4 text-sm leading-relaxed text-brand-navy/80`}>
      {children}
    </div>
  );
}

export function LegalAttribution() {
  return (
    <div className="mt-8 flex items-center gap-2 border-t border-black/5 pt-6 text-xs text-brand-navy/40">
      <span>A product of</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/shagoon-softech-logo.svg"
        alt="Shagoon Softech Pvt. Ltd."
        className="h-4 w-auto opacity-70"
      />
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-4xl px-4 pt-6 text-sm text-brand-navy/50">
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
