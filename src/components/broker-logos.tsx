import Link from "next/link";
import { BROKERS, type BrokerInfo } from "@/lib/brokers/catalog";

// Marketing view of the brokers users can connect — driven by the same
// catalog as the Broker Connections page, so the count and logos can never
// drift from what actually works. "full" is a section of its own; "strip" is a
// compact scrolling row for pages that only need a mention.

const live = BROKERS.filter((b) => b.availability === "live");
const next = BROKERS.filter((b) => b.availability === "next");
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function Logo({ broker, size = 44 }: { broker: BrokerInfo; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-black/[0.06]" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static brand marks */}
      <img src={broker.logo} alt={`${broker.name} logo`} width={Math.round(size * 0.64)} height={Math.round(size * 0.64)} className="object-contain" />
    </span>
  );
}

export default function BrokerLogos({ variant = "full" }: { variant?: "full" | "strip" }) {
  if (variant === "strip") {
    const row = [...live, ...live]; // duplicated for a seamless loop
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-brand-navy">
            <span className="text-brand-primary">{live.length} brokers</span> you can connect today
            {next.length > 0 && <span className="font-normal text-brand-navy/50"> · {next.map((b) => b.name).join(", ")} next</span>}
          </p>
          <Link href="/live-trading#brokers" className="text-xs font-semibold text-brand-primary hover:underline">
            How connecting works →
          </Link>
        </div>
        <div className="relative mt-4 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <ul className="flex w-max motion-safe:animate-[logo-marquee_36s_linear_infinite] motion-safe:hover:[animation-play-state:paused]" aria-label="Supported brokers">
            {row.map((b, i) => (
              <li key={`${b.id}-${i}`} aria-hidden={i >= live.length} className="mr-3 flex items-center gap-2 rounded-full bg-brand-bg/80 py-1.5 pl-1.5 pr-3.5 ring-1 ring-black/[0.05]">
                <Logo broker={b} size={30} />
                <span className="whitespace-nowrap text-xs font-semibold text-brand-navy/80">{b.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const count = WORDS[live.length] ?? String(live.length);
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
      <div>
        <div className="flex items-center gap-2.5">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Broker connections</p>
          <span className="rounded-full bg-brand-buy/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-buy">Live</span>
        </div>
        <h2 className="mt-2 text-3xl font-bold text-brand-navy">Works with the broker you already use</h2>
        <div className="mt-6 flex items-end gap-4">
          <span className="bg-gradient-to-br from-brand-primary to-brand-primary-light bg-clip-text text-7xl font-bold leading-none tracking-tight text-transparent">{live.length}</span>
          <span className="pb-1.5 text-sm font-medium leading-snug text-brand-navy/70">
            Indian brokers you can
            <br />
            connect today{next.length > 0 && <span className="text-brand-navy/45"> — {next.map((b) => b.name).join(", ")} next</span>}
          </span>
        </div>
        <p className="mt-5 text-brand-navy/70">
          Link your own account through your broker&rsquo;s official API in a few minutes. Our step-by-step guide gives you the exact
          Redirect URL to paste — and your agent can walk you through it.
        </p>
        <ul className="mt-5 space-y-2.5 text-sm text-brand-navy/75">
          {[
            "Your own API key — encrypted with AES-256, never shown again",
            "You log in on your broker’s own page — we never see your password, PIN or 2FA",
            "Disconnect any time; live order placement is coming soon",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
              {t}
            </li>
          ))}
        </ul>
        <Link href="/signup" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-navy hover:text-brand-primary">
          Connect your broker free →
        </Link>
      </div>

      <div className="relative">
        <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-primary/[0.07] via-transparent to-brand-gold/[0.08] blur-2xl" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`${count} supported brokers`}>
          {live.map((b) => (
            <li key={b.id} className="hover-lift flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_10px_30px_-18px_rgba(14,27,45,0.35)] ring-1 ring-black/[0.05]">
              <Logo broker={b} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-brand-navy">{b.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-brand-buy">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-buy" /> Connect now
                </span>
              </span>
            </li>
          ))}
          {next.map((b) => (
            <li key={b.id} className="col-span-2 flex items-center gap-3 rounded-2xl border border-dashed border-brand-navy/15 bg-white/50 p-3.5 sm:col-span-3">
              <span className="opacity-60">
                <Logo broker={b} size={36} />
              </span>
              <span className="text-sm text-brand-navy/55">
                <strong className="font-semibold text-brand-navy/70">{b.name}</strong> — coming next
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
