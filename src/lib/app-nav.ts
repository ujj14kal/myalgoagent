import {
  Activity,
  Bell,
  Bot,
  BriefcaseBusiness,
  CandlestickChart,
  FlaskConical,
  LayoutDashboard,
  Layers,
  Link2,
  ListOrdered,
  Radio,
  ShieldCheck,
  Siren,
  Star,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "Trading",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/instruments", label: "Market Data", icon: CandlestickChart },
      { href: "/app/strategies", label: "Strategies", icon: Layers },
      { href: "/app/backtests", label: "Backtests", icon: FlaskConical },
      { href: "/app/paper-trading", label: "Paper Trading", icon: Activity },
      { href: "/app/live-trading", label: "Live Trading", icon: Radio },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/app/portfolio", label: "Portfolio", icon: Wallet },
      { href: "/app/orders", label: "Orders", icon: ListOrdered },
      { href: "/app/positions", label: "Positions", icon: BriefcaseBusiness },
      { href: "/app/watchlist", label: "Watchlist", icon: Star },
    ],
  },
  {
    label: "Risk & Alerts",
    items: [
      { href: "/app/alerts", label: "Alerts", icon: Siren },
      { href: "/app/risk-controls", label: "Risk Controls", icon: ShieldCheck },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/app/broker-connections", label: "Broker Connections", icon: Link2 },
      { href: "/app/account", label: "Account / Settings", icon: UserRound },
      { href: "/app/agent-settings", label: "Agent Settings", icon: Bot },
      { href: "/app/notifications", label: "Notifications", icon: Bell },
    ],
  },
];

export function isActive(pathname: string | null, href: string) {
  return pathname === href || !!pathname?.startsWith(href + "/");
}

export function currentNavItem(pathname: string | null): NavItem | undefined {
  for (const g of navGroups) for (const i of g.items) if (isActive(pathname, i.href)) return i;
  return undefined;
}
