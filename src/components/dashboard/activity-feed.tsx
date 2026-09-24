import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";

type ActivityItem = { id: string; kind: "order" | "risk"; label: string; detail: string; at: Date; tone: "buy" | "sell" | "warn" };

const TONE = {
  buy: { cls: "bg-brand-buy/10 text-brand-buy", Icon: ArrowUpRight },
  sell: { cls: "bg-brand-sell/10 text-brand-sell", Icon: ArrowDownRight },
  warn: { cls: "bg-brand-gold/15 text-[#8a7437]", Icon: TriangleAlert },
};

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-brand-navy/45">No activity yet — fills and risk events will show up here.</p>;
  }
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-brand-navy/10">
      {items.map((item) => {
        const { cls, Icon } = TONE[item.tone];
        return (
          <li key={item.id} className="relative flex items-start gap-3">
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${cls}`}>
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-semibold text-brand-navy">{item.label}</p>
              <p className="truncate text-xs text-brand-navy/50">{item.detail}</p>
            </div>
            <time className="shrink-0 pt-1 text-xs text-brand-navy/40">
              {item.at.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
