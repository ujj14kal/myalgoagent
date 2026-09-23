"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { navGroups } from "@/components/app-sidebar";
import FeedbackWidget from "@/components/feedback-widget";

/**
 * The main sidebar (app-sidebar.tsx) is `hidden md:block` — below the `md`
 * breakpoint there was previously no way to reach it at all, so this is
 * the mobile equivalent: a hamburger trigger (rendered in the topbar) plus
 * a slide-in drawer with the same nav groups, closing itself on navigation
 * or backdrop tap.
 */
export default function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-navy/70 hover:bg-brand-bg hover:text-brand-primary"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[80vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between gap-2 border-b border-black/5 px-5">
              <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                <Image src="/brand/icon-mark.png" alt="MyAlgoAgent" width={28} height={28} />
                <span className="text-base font-bold text-brand-primary">MyAlgoAgent</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-navy/50 hover:bg-brand-bg hover:text-brand-primary"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 space-y-6 overflow-y-auto p-4">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">{group.label}</p>
                  <ul className="mt-2 space-y-1">
                    {group.items.map((item) => {
                      const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={`block rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                              active
                                ? "bg-brand-primary/10 text-brand-primary"
                                : "text-brand-navy/70 hover:bg-brand-bg hover:text-brand-primary"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="shrink-0 border-t border-black/5 p-4">
              <FeedbackWidget />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
