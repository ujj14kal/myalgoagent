"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import BodyPortal from "@/components/ui/body-portal";
import { Menu, X } from "lucide-react";
import AppNavList from "@/components/app-nav-list";
import AgentStatusCard from "@/components/agent-status-card";
import FeedbackWidget from "@/components/feedback-widget";

/** Below `md` the sidebar is hidden — this is the same navigation as a slide-in drawer. */
export default function MobileNavDrawer({ agentName, liveSessions }: { agentName: string; liveSessions: number }) {
  const pathname = usePathname();
  // Remember which page the drawer was opened on: navigating anywhere else
  // (a link tap, browser back) closes it with no extra effect needed.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);

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
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-brand-navy/70 hover:bg-brand-primary/5 hover:text-brand-primary"
      >
        <Menu size={20} />
      </button>

      <BodyPortal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
            <motion.button
              type="button"
              aria-label="Close navigation menu"
              className="absolute inset-0 bg-[#0e1b2d]/50 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="app-sidebar-bg relative flex h-full w-72 max-w-[82vw] flex-col text-white shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <div className="flex h-16 shrink-0 items-center justify-between px-5">
                <Link href="/app/dashboard" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
                  <Image src="/brand/icon-mark.png" alt="" width={30} height={30} className="rounded-lg ring-1 ring-white/20" />
                  <span className="text-base font-bold text-white">MyAlgoAgent</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
                <AppNavList layoutId="drawer-active" onNavigate={() => setOpen(false)} />
              </div>
              <div className="shrink-0 space-y-3 border-t border-white/10 p-3">
                <AgentStatusCard agentName={agentName} liveSessions={liveSessions} />
                <FeedbackWidget />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      </BodyPortal>
    </div>
  );
}
