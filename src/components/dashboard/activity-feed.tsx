type ActivityItem = { id: string; kind: "order" | "risk"; label: string; detail: string; at: Date; tone: "buy" | "sell" | "warn" };

const TONE_DOT: Record<ActivityItem["tone"], string> = {
  buy: "bg-brand-buy",
  sell: "bg-brand-sell",
  warn: "bg-brand-gold",
};

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-brand-navy/40">No activity yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[item.tone]}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-navy">{item.label}</p>
            <p className="truncate text-xs text-brand-navy/50">{item.detail}</p>
          </div>
          <span className="ml-auto shrink-0 text-xs text-brand-navy/30">
            {item.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </li>
      ))}
    </ul>
  );
}
