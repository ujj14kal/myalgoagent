"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** True when `pathname` is this link's page (or a page under it). */
export function isActiveLink(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The marketing header's links — the page you're on is bold, violet and underlined. */
export default function SiteNavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => {
        const active = isActiveLink(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`text-sm transition-colors hover:text-brand-primary ${
              active ? "font-bold text-brand-primary underline decoration-2 underline-offset-[6px]" : "font-medium text-brand-navy/70"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
