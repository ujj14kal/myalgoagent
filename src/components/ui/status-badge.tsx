const STYLES: Record<string, string> = {
  ACTIVE: "bg-brand-buy/10 text-brand-buy ring-brand-buy/20",
  PAUSED: "bg-brand-gold/15 text-[#8a7437] ring-brand-gold/30",
  STOPPED: "bg-brand-navy/5 text-brand-navy/55 ring-brand-navy/10",
  DRAFT: "bg-brand-navy/5 text-brand-navy/55 ring-brand-navy/10",
  ARCHIVED: "bg-brand-navy/5 text-brand-navy/45 ring-brand-navy/10",
  DELETED: "bg-brand-sell/10 text-brand-sell ring-brand-sell/20",
  BUY: "bg-brand-buy/10 text-brand-buy ring-brand-buy/20",
  SELL: "bg-brand-sell/10 text-brand-sell ring-brand-sell/20",
  LONG: "bg-brand-buy/10 text-brand-buy ring-brand-buy/20",
  SHORT: "bg-brand-sell/10 text-brand-sell ring-brand-sell/20",
};

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  const live = status === "ACTIVE";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${STYLES[status] ?? STYLES.DRAFT}`}
    >
      {live && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-buy opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-buy" />
        </span>
      )}
      {label ?? status.toLowerCase()}
    </span>
  );
}
