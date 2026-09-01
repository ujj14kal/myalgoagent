export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 [&>h2]:mt-10 [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:text-brand-navy [&>h2:first-child]:mt-0 [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:text-brand-navy [&>p]:mt-3 [&>p]:leading-relaxed [&>p]:text-brand-navy/75 [&>ul]:mt-3 [&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-6 [&>ul]:text-brand-navy/75 [&_a]:text-brand-primary [&_a]:underline [&_a]:underline-offset-2">
      {children}
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
