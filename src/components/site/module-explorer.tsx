"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap, reducedMotion } from "./motion";

export type Module = { id: string; label: string; title: string; text: string; points: string[]; href: string };

/**
 * Orbit visual + accessible tab explorer. Module labels circle the core on two rings in opposite
 * directions (driven by the GSAP ticker so they stay upright and inside the box); the active module's
 * label lights up. Tabs auto-advance while in view until the user interacts.
 */
export default function ModuleExplorer({ modules }: { modules: Module[] }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const orbitRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const inView = useRef(false);

  // Orbiting labels.
  useEffect(() => {
    const box = orbitRef.current;
    if (!box) return;
    const labels = Array.from(box.querySelectorAll<HTMLElement>("[data-orbit-label]"));
    const half = Math.ceil(labels.length / 2);
    let angle = 0;
    const place = () => {
      const w = box.clientWidth;
      const c = w / 2;
      labels.forEach((el, i) => {
        const inner = i < half;
        const n = inner ? half : labels.length - half;
        const k = inner ? i : i - half;
        const r = (inner ? 0.3 : 0.46) * w;
        const a = (inner ? angle : -angle * 0.7) + (k / n) * Math.PI * 2 + (inner ? 0 : Math.PI / n);
        const lw = el.offsetWidth;
        const lh = el.offsetHeight;
        // Clamped so a label never spills out of the box.
        const x = Math.min(Math.max(c + Math.cos(a) * r - lw / 2, 0), w - lw);
        const y = Math.min(Math.max(c + Math.sin(a) * r - lh / 2, 0), w - lh);
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    };
    const tick = () => {
      angle += 0.0025;
      place();
    };
    place();
    if (reducedMotion()) return;
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  // Auto-advance while visible, until the user takes over.
  useEffect(() => {
    const box = orbitRef.current?.closest("section");
    if (!box) return;
    const io = new IntersectionObserver(([e]) => (inView.current = e.isIntersecting), { threshold: 0.3 });
    io.observe(box);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!auto || reducedMotion()) return;
    const id = setInterval(() => inView.current && setActive((a) => (a + 1) % modules.length), 4200);
    return () => clearInterval(id);
  }, [auto, modules.length]);

  // Panel content animates in.
  useEffect(() => {
    if (!panelRef.current || reducedMotion()) return;
    gsap.fromTo(panelRef.current.querySelectorAll("[data-panel-in]"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power4.out", stagger: 0.06 });
  }, [active]);

  const choose = (i: number, focus = false) => {
    setAuto(false);
    setActive(i);
    if (focus) tabs.current[i]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const last = modules.length - 1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") choose(active === last ? 0 : active + 1, true);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") choose(active === 0 ? last : active - 1, true);
    else if (e.key === "Home") choose(0, true);
    else if (e.key === "End") choose(last, true);
    else return;
    e.preventDefault();
  };
  const m = modules[active];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      <div ref={orbitRef} className="mk-orbit" aria-hidden>
        <div className="mk-orbit__ring" style={{ ["--inset" as string]: "0%" }} />
        <div className="mk-orbit__ring mk-orbit__ring--dashed" style={{ ["--inset" as string]: "8%" }} />
        <div className="mk-orbit__ring" style={{ ["--inset" as string]: "20%" }} />
        <div className="mk-orbit__ring mk-orbit__ring--dashed" style={{ ["--inset" as string]: "30%" }} />
        <div className="mk-orbit__core">
          <Image src="/brand/icon-mark.png" alt="" width={72} height={72} className="rounded-[22%]" />
        </div>
        {modules.map((mod, i) => (
          <span key={mod.id} data-orbit-label className={`mk-orbit__label ${i === active ? "is-active" : ""}`}>
            {mod.label}
          </span>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div role="tablist" aria-label="Platform modules" aria-orientation="vertical" className="flex flex-row flex-wrap gap-1 md:flex-col" onKeyDown={onKey}>
          {modules.map((mod, i) => (
            <button
              key={mod.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`tab-${mod.id}`}
              role="tab"
              type="button"
              aria-selected={i === active}
              aria-controls={`panel-${mod.id}`}
              tabIndex={i === active ? 0 : -1}
              className="mk-tab text-sm"
              onClick={() => choose(i)}
            >
              {mod.label}
            </button>
          ))}
        </div>
        <div ref={panelRef} id={`panel-${m.id}`} role="tabpanel" aria-labelledby={`tab-${m.id}`} className="mk-card min-h-[300px]">
          <h3 data-panel-in className="mk-display mk-h3 text-white">
            {m.title}
          </h3>
          <p data-panel-in className="mt-4 leading-relaxed">
            {m.text}
          </p>
          <ul className="mt-6 space-y-2.5">
            {m.points.map((p) => (
              <li key={p} data-panel-in className="flex items-start gap-2.5 text-sm text-white/80">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mk-gold)" strokeWidth="2.2" className="mt-0.5 shrink-0" aria-hidden>
                  <path d="M5 12l5 5L19 7" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
          <Link data-panel-in href={m.href} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--mk-gold)]">
            Learn more
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
