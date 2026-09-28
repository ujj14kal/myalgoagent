import Link from "next/link";
import { Link2, Plus } from "lucide-react";
import { brokerById } from "@/lib/brokers/catalog";

export type ConnectedBroker = { broker: string; live: boolean };

/**
 * Top-bar broker strip: the logos of every broker the user has linked (a
 * green dot when today's session is live, gold when they need to log in for
 * today) plus a "+" to add another. Before any broker is linked it's the
 * "Connect broker" button.
 */
export default function ConnectedBrokers({ brokers }: { brokers: ConnectedBroker[] }) {
  const known = brokers.map((b) => ({ ...b, info: brokerById(b.broker) })).filter((b) => b.info);
  if (known.length === 0) {
    return (
      <Link
        href="/app/broker-connections"
        className="hidden items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_4px_12px_-6px_rgba(71,24,152,0.7)] transition-colors hover:bg-brand-primary-light md:flex"
      >
        <Link2 size={13} />
        Connect broker
      </Link>
    );
  }
  return (
    <div className="hidden items-center gap-1 rounded-full bg-white py-1 pl-1.5 pr-1 shadow-[0_4px_14px_-8px_rgba(14,27,45,0.35)] ring-1 ring-black/[0.06] md:flex">
      <div className="flex items-center gap-1.5">
        {known.map(({ broker, live, info }) => (
          <Link
            key={broker}
            href={`/app/broker-connections?broker=${broker}`}
            title={`${info!.name} — ${live ? "connected for today" : "log in for today"}`}
            aria-label={`${info!.name}: ${live ? "connected for today" : "log in for today"}`}
            className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white transition-transform hover:-translate-y-0.5"
          >
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/[0.08]">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static brand marks */}
              <img src={info!.logo} alt="" className="h-[18px] w-[18px] object-contain" />
            </span>
            <span className={`absolute -bottom-px -right-px h-2 w-2 rounded-full ring-[1.5px] ring-white ${live ? "bg-brand-buy" : "bg-brand-gold"}`} />
          </Link>
        ))}
      </div>
      <Link
        href="/app/broker-connections"
        title="Connect another broker"
        aria-label="Connect another broker"
        className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary text-white transition-colors hover:bg-brand-primary-light"
      >
        <Plus size={14} strokeWidth={2.6} />
      </Link>
    </div>
  );
}
