"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin progress bar across the top while a page loads after you click a link, so every click is acknowledged at once.
 * It starts on an in-site link click and completes when the new path arrives (or after a safety timeout).
 */
export default function NavProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let u: URL;
      try {
        u = new URL(a.href);
      } catch {
        return;
      }
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search) || u.hash) return;
      clear();
      setPhase("run");
      timers.current.push(setTimeout(() => setPhase("done"), 12_000));
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clear();
    };
  }, []);

  useEffect(() => {
    // The new page has arrived: finish the bar, then hide it.
    const t0 = setTimeout(() => setPhase((p) => (p === "run" ? "done" : p)), 0);
    return () => clearTimeout(t0);
  }, [pathname]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 400);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div className={`h-full origin-left bg-gradient-to-r from-brand-primary via-brand-primary-light to-brand-gold shadow-[0_0_8px_rgba(71,24,152,0.5)] ${phase === "run" ? "nav-progress-run" : "nav-progress-done"}`} />
    </div>
  );
}
