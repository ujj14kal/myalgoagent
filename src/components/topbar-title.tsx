"use client";

import { usePathname } from "next/navigation";
import { currentNavItem } from "@/lib/app-nav";

/** Current section name in the top bar, so you always know where you are. */
export default function TopbarTitle() {
  const item = currentNavItem(usePathname());
  if (!item) return null;
  const Icon = item.icon;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-brand-navy">
      <Icon size={16} className="shrink-0 text-brand-primary" />
      <span className="truncate">{item.label}</span>
    </div>
  );
}
