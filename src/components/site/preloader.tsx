"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, reducedMotion, stopSmoothScroll, resumeSmoothScroll } from "./motion";

/** Signals the hero intro to start (once). */
function go() {
  const d = document.documentElement;
  if (d.classList.contains("mk-intro-go")) return;
  d.classList.add("mk-intro-go");
  window.dispatchEvent(new Event("mk:intro"));
}

/**
 * Branded preloader, once per visit: the logo frame draws itself, the robot's parts pop in, the bar
 * fills, then the overlay wipes away and the hero intro begins. Skipped for reduced motion.
 */
export default function Preloader() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(true);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("mk-preloaded") === "1";
    } catch {}
    const el = ref.current;
    const planned = document.documentElement.classList.contains("mk-preload");
    if (seen || !planned || reducedMotion() || !el) {
      document.documentElement.classList.remove("mk-preload");
      setShow(false);
      go();
      return;
    }
    try {
      sessionStorage.setItem("mk-preloaded", "1");
    } catch {}
    stopSmoothScroll();
    const frame = el.querySelector<SVGPathElement>("[data-frame]")!;
    const len = frame.getTotalLength();
    const tl = gsap.timeline({
      onComplete: () => {
        resumeSmoothScroll();
        document.documentElement.classList.remove("mk-preload");
        setShow(false);
      },
    });
    tl.set(frame, { strokeDasharray: len, strokeDashoffset: len })
      .to(frame, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" })
      .fromTo(el.querySelectorAll("[data-part]"), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.5, ease: "back.out(2.4)", stagger: 0.08 }, "-=0.35")
      .to(el.querySelector(".mk-preloader__bar i"), { scaleX: 1, duration: 0.9, ease: "power2.inOut" }, "<")
      .add(go)
      .to(el, { clipPath: "inset(0 0 100% 0)", duration: 0.9, ease: "power4.inOut" });
    return () => {
      // Interrupted (e.g. React's double effect run in development): allow it to play again.
      if (tl.progress() < 1) {
        try {
          sessionStorage.removeItem("mk-preloaded");
        } catch {}
      }
      tl.kill();
      resumeSmoothScroll();
    };
  }, []);

  if (!show) return null;
  return (
    <div ref={ref} className="mk-preloader" aria-hidden>
      <div className="flex flex-col items-center">
        <svg width="112" height="112" viewBox="0 0 120 120" fill="none">
          <path data-frame d="M38 14h44a24 24 0 0 1 24 24v44a24 24 0 0 1-24 24H38a24 24 0 0 1-24-24V38a24 24 0 0 1 24-24z" stroke="#bda360" strokeWidth="3" />
          <rect data-part x="34" y="36" width="52" height="48" rx="12" fill="#fff" />
          <rect data-part x="56" y="24" width="8" height="14" rx="4" fill="#fff" />
          <rect data-part x="26" y="50" width="8" height="20" rx="4" fill="#fff" />
          <rect data-part x="86" y="50" width="8" height="20" rx="4" fill="#fff" />
          <circle data-part cx="51" cy="58" r="5" fill="#471898" />
          <circle data-part cx="69" cy="58" r="5" fill="#471898" />
        </svg>
        <div className="mk-preloader__bar">
          <i />
        </div>
      </div>
    </div>
  );
}

export { go as startHeroIntro };
