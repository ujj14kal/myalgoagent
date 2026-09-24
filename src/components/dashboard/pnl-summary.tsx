import { CalendarDays, CalendarRange, Clock3, Infinity as InfinityIcon } from "lucide-react";
import type { PeriodPnl } from "@/lib/portfolio";
import StatCard from "@/components/ui/stat-card";
import { formatSignedINR, toneOf } from "@/lib/format";

export default function PnlSummary({ pnl }: { pnl: PeriodPnl }) {
  const rows = [
    { label: "Today", value: pnl.today, icon: Clock3 },
    { label: "This week", value: pnl.week, icon: CalendarDays },
    { label: "This month", value: pnl.month, icon: CalendarRange },
    { label: "All time", value: pnl.allTime, icon: InfinityIcon },
  ];
  return (
    <div data-tour="pnl-summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {rows.map((r) => {
        const tone = toneOf(r.value);
        return (
          <StatCard
            key={r.label}
            label={r.label}
            value={formatSignedINR(r.value)}
            sub="Realised P&L"
            tone={tone}
            icon={r.icon}
            accent={tone === "up" ? "buy" : tone === "down" ? "sell" : "primary"}
          />
        );
      })}
    </div>
  );
}
