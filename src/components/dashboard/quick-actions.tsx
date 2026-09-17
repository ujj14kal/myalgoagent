import Link from "next/link";

const ACTIONS = [
  {
    href: "/app/strategies/new",
    label: "New strategy",
    description: "Build a rule visually or as code",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    ),
  },
  {
    href: "/app/backtests",
    label: "Run a backtest",
    description: "Test a strategy on real historical data",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3v18h18M7 15l3.5-4 3 2.5L18 8"
      />
    ),
  },
  {
    href: "/app/watchlist",
    label: "Add to watchlist",
    description: "Track an instrument's price and signals",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 17.25l-6.16 3.24 1.18-6.88L2 8.76l6.92-1L12 1.5l3.08 6.26 6.92 1-5.02 4.85 1.18 6.88z"
      />
    ),
  },
  {
    href: "/app/paper-trading",
    label: "Start paper trading",
    description: "Run a strategy live against virtual capital",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    ),
  },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex flex-col gap-2 rounded-xl border border-black/5 p-3 transition-colors hover:border-brand-primary/30 hover:bg-brand-bg"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              {a.icon}
            </svg>
          </span>
          <span>
            <span className="block text-sm font-semibold text-brand-navy group-hover:text-brand-primary">{a.label}</span>
            <span className="block text-xs text-brand-navy/50">{a.description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
