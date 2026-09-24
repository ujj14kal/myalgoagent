export default function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  // Not wrapped in <Reveal>: this is the first thing on the page, and fading
  // it in from invisible delays the page's main content for every visitor.
  return (
    <div className="gradient-mesh border-b border-black/5">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-20">
        {eyebrow && (
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary ring-1 ring-brand-primary/10">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
            {eyebrow}
          </p>
        )}
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">{title}</h1>
        {description && <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-navy/70">{description}</p>}
      </div>
    </div>
  );
}
