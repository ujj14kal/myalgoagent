import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** The empty state of a dashboard card: centred in the space the card has, with one clear next step, so a new account's dashboard has no hollow areas. */
export default function EmptyCard({ icon: Icon, title, hint, href, cta }: { icon: LucideIcon; title: string; hint: string; href: string; cta: string }) {
  return (
    <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-1.5 px-2 py-4 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/[0.08] text-brand-primary">
        <Icon size={18} />
      </span>
      <p className="mt-1 text-sm font-semibold text-brand-navy">{title}</p>
      <p className="max-w-[16rem] text-xs leading-relaxed text-brand-navy/55">{hint}</p>
      <Link href={href} className="mt-2 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-light">
        {cta}
      </Link>
    </div>
  );
}
