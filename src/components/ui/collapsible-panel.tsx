"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

/** A card whose body opens on demand — keeps secondary forms out of the way. */
export default function CollapsiblePanel({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** A rendered element (e.g. <Plus size={17} />), not a component: this is a
   * Client Component, and a Server Component can't pass it a function. */
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-brand-primary/[0.02]"
      >
        <span className="flex items-center gap-3">
          {icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-white">{icon}</span>}
          <span>
            <span className="block text-sm font-semibold text-brand-navy">{title}</span>
            {subtitle && <span className="block text-xs text-brand-navy/50">{subtitle}</span>}
          </span>
        </span>
        <ChevronDown size={18} className={`text-brand-navy/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <div className="border-t border-black/[0.05] p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
