"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertOctagon, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

// The team's current announcement (maintenance, news) across the top of the
// app. Dismissing hides that one announcement on this browser; critical ones
// can't be dismissed.

type Level = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
const STYLE: Record<Level, { cls: string; Icon: typeof Info }> = {
  INFO: { cls: "bg-brand-blue-light text-[#23408f] ring-brand-blue/20", Icon: Info },
  SUCCESS: { cls: "bg-brand-buy/10 text-[#0b6b30] ring-brand-buy/20", Icon: CheckCircle2 },
  WARNING: { cls: "bg-brand-gold/15 text-[#6f5a22] ring-brand-gold/30", Icon: TriangleAlert },
  CRITICAL: { cls: "bg-brand-sell/10 text-[#8f1010] ring-brand-sell/25", Icon: AlertOctagon },
};

export default function AnnouncementBanner({ id, title, body, level, link }: { id: string; title: string; body: string; level: Level; link: string | null }) {
  const key = `maa-announcement-dismissed:${id}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) === "1";
    } catch {
      // Storage blocked: just show it.
    }
    // Read after mount so the server render never guesses (no flash of a dismissed banner).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(dismissed && level !== "CRITICAL");
  }, [key, level]);
  if (hidden) return null;
  const { cls, Icon } = STYLE[level];
  return (
    <div role="status" className={`mx-4 mt-3 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1 md:mx-6 lg:mx-8 ${cls}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">{title}</strong> <span className="opacity-90">{body}</span>
        {link && (
          <Link href={link} className="ml-1.5 font-semibold underline underline-offset-2">
            Learn more
          </Link>
        )}
      </p>
      {level !== "CRITICAL" && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            try {
              localStorage.setItem(key, "1");
            } catch {}
            setHidden(true);
          }}
          className="-m-1 rounded-lg p-1 opacity-60 hover:opacity-100"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
