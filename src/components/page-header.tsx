import Reveal from "@/components/reveal";

export default function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="border-b border-black/5 bg-white">
      <Reveal className="mx-auto max-w-4xl px-4 py-16 text-center">
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">
            {eyebrow}
          </p>
        )}
        <div className="accent-bar mx-auto mt-3" />
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-navy/70">
            {description}
          </p>
        )}
      </Reveal>
    </div>
  );
}
