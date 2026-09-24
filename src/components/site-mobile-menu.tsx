"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import BodyPortal from "@/components/ui/body-portal";
import { ArrowRight, Menu, X } from "lucide-react";

/** The marketing header's navigation on phones (the desktop nav is hidden below md). */
export default function SiteMobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-brand-navy/70 hover:bg-brand-primary/5 hover:text-brand-primary"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <BodyPortal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-black/5 bg-brand-bg px-4 pb-8 pt-4"
          >
            <nav aria-label="Mobile" className="flex flex-col">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpenOn(null)}
                  className={`flex items-center justify-between border-b border-black/5 py-4 text-base font-semibold ${
                    pathname === l.href ? "text-brand-primary" : "text-brand-navy"
                  }`}
                >
                  {l.label}
                  <ArrowRight size={16} className="text-brand-navy/25" />
                </Link>
              ))}
            </nav>
            <div className="mt-6 grid gap-3">
              <Link href="/signup" onClick={() => setOpenOn(null)} className="rounded-full bg-brand-primary py-3 text-center text-sm font-semibold text-white">
                Get started free
              </Link>
              <Link href="/login" onClick={() => setOpenOn(null)} className="rounded-full border border-brand-navy/15 py-3 text-center text-sm font-semibold text-brand-navy">
                Sign in
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </BodyPortal>
    </div>
  );
}
