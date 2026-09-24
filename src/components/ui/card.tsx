import type { LucideIcon } from "lucide-react";

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return <div className={`surface ${interactive ? "surface-interactive" : ""} ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  icon: Icon,
  action,
  subtitle,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Icon size={16} strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-navy">{title}</p>
          {subtitle && <p className="truncate text-xs text-brand-navy/50">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
