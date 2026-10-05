import Link from "next/link";
import Agent2D from "@/components/robot/agent-2d";
import { PageMotion } from "@/components/site/site-motion";

export default function NotFound() {
  return (
    <section data-full-bleed data-theme="dark" className="mk-dark relative isolate flex min-h-[100svh] items-center overflow-hidden">
      <div className="mk-grid-bg" aria-hidden />
      <div className="mk-glow left-[20%] top-[25%] h-[380px] w-[380px] bg-[var(--mk-accent)]" aria-hidden />
      <div className="mk-outline-word left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[34vw]" aria-hidden>
        404
      </div>
      <div className="mk-wrap relative flex flex-col items-center pt-24 text-center">
        <Agent2D pose="thinking" size={130} />
        <h1 className="mk-display mk-h2 mt-8 text-white" data-split="now">
          Page not found
        </h1>
        <p className="mk-lead mt-5 max-w-md" data-rise>
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3" data-rise>
          <Link href="/" className="mk-btn mk-btn--gold" data-magnetic>
            Back to home
          </Link>
          <Link href="/product" className="mk-btn mk-btn--ghost">
            Product overview
          </Link>
        </div>
      </div>
      <PageMotion />
    </section>
  );
}
