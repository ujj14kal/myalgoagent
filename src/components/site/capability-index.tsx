"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollTrigger, gsap, reducedMotion } from "./motion";

/** Sticky index for the capability panels: highlights the panel in view and shows scroll progress. */
export default function CapabilityIndex({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const triggers = items.map((it) => {
      const el = document.getElementById(it.id);
      return el ? ScrollTrigger.create({ trigger: el, start: "top 55%", end: "bottom 55%", onToggle: (s) => s.isActive && setActive(it.id) }) : null;
    });
    const wrap = document.getElementById(items[0]?.id)?.parentElement;
    const prog = wrap && bar.current && !reducedMotion() ? gsap.fromTo(bar.current, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: wrap, start: "top 55%", end: "bottom 55%", scrub: true } }) : null;
    return () => {
      triggers.forEach((t) => t?.kill());
      prog?.scrollTrigger?.kill();
      prog?.kill();
    };
  }, [items]);
  return (
    <nav aria-label="Capabilities" className="mk-index relative pl-5">
      <span className="absolute left-0 top-0 h-full w-[2px] rounded bg-[var(--mk-line)]" aria-hidden />
      <i ref={bar} className="absolute left-0 top-0 h-full w-[2px] origin-top rounded bg-[var(--mk-accent)]" aria-hidden style={{ transform: "scaleY(0)" }} />
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} className={active === it.id ? "is-active" : ""} aria-current={active === it.id ? "true" : undefined}>
          <i aria-hidden />
          {it.label}
        </a>
      ))}
    </nav>
  );
}
