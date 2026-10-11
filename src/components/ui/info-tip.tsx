"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * A small "i" that holds the longer explanation, so a screen shows what you need and the detail is one hover, tap or
 * keypress away. Works with mouse (hover), keyboard (focus) and touch (tap); Escape or a tap elsewhere closes it.
 */
export default function InfoTip({ children, label = "More information", align = "left" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-brand-navy/40 transition-colors hover:text-brand-primary focus-visible:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
      >
        <Info size={14} />
      </button>
      {open && (
        <span id={id} role="tooltip" className={`absolute top-full z-30 mt-1.5 w-64 max-w-[80vw] rounded-lg bg-brand-navy px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </span>
      )}
    </span>
  );
}
