import type { LucideIcon } from "lucide-react";

/** Consistent top-of-page header for every /app page. */
export default function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary to-brand-primary-light text-white shadow-[0_8px_20px_-8px_rgba(71,24,152,0.6)] sm:flex">
            <Icon size={20} strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold">{eyebrow}</p>}
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-[1.7rem]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-brand-navy/60">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
