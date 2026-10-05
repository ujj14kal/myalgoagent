import Image from "next/image";
import { PageMotion } from "./site-motion";

/** Sign-in, sign-up and password pages: a dark brand panel beside the form card, same language as the site. */
export default function AuthShell({ children, aside = "Build strategies. Test every assumption. Control every trade." }: { children: React.ReactNode; aside?: string }) {
  return (
    <section data-full-bleed data-theme="dark" className="mk-dark relative isolate grid min-h-[100svh] lg:grid-cols-[1fr_1.05fr]">
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-end lg:p-16">
        <div className="mk-grid-bg" data-speed="0.15" aria-hidden />
        <div className="mk-glow -left-20 top-[20%] h-[380px] w-[380px] bg-[var(--mk-accent)]" data-speed="0.4" aria-hidden />
        <div className="mk-glow bottom-[10%] right-[-10%] h-[300px] w-[300px] bg-[var(--mk-gold)] !opacity-30" data-speed="0.6" aria-hidden />
        <div className="relative">
          <Image src="/brand/icon-mark.png" alt="" width={64} height={64} className="rounded-[18px] shadow-[0_0_60px_rgba(106,53,194,0.6)]" />
          <div className="mk-display mk-h2 mt-10 max-w-lg text-white" data-split="now" data-delay="0.1">
            {aside}
          </div>
          <p className="mt-6 max-w-md text-sm leading-relaxed" data-rise data-delay="0.3">
            Software for rule-based trading on your own broker account. Not investment advice; trading involves risk of loss.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-[var(--mk-dark-2)] px-4 pb-16 pt-28">
        <div className="mk-card mk-paper w-full max-w-md text-center sm:!p-10" data-rise>
          {children}
        </div>
      </div>
      <PageMotion />
    </section>
  );
}
