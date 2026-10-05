"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

// The marketing site's motion runtime: Lenis smooth scrolling driven by the GSAP ticker and synced to
// ScrollTrigger, plus every scroll effect, wired from data attributes so pages stay plain markup:
//   data-split            words rise into place (yPercent 110 → 0) when the element enters
//   data-scrub-words      words go from faint to full ink as you scroll; [data-accent] words turn accent
//   data-rise           fade up         data-stagger   children fade up one after another
//   data-speed="0.3"      parallax layer (positive = slower than the page)
//   data-count="1200"     number counts up (Indian locale)
//   data-draw             SVG paths draw themselves on scroll
//   data-tilt             3D tilt + cursor spotlight      data-magnetic  leans toward the cursor
//   data-marquee          infinite strip reacting to scroll velocity
//   data-hscroll          pinned horizontal scroll (desktop), stacked on mobile
//   data-hero-drift       content drifts down and fades as the hero leaves
//   data-connector        lines scale in one after another
// Everything is skipped under prefers-reduced-motion: content simply shows.

gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };

export const EASE = "power4.out"; // ≈ cubic-bezier(0.22, 1, 0.36, 1)
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

let lenis: Lenis | null = null;
export const getLenis = () => lenis;

/** One Lenis for the whole site, ticked by GSAP. */
export function startSmoothScroll() {
  if (lenis || reducedMotion()) return;
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis?.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

export function stopSmoothScroll() {
  lenis?.stop();
}
export function resumeSmoothScroll() {
  lenis?.start();
}

/** Scroll to an element through Lenis, leaving room for the fixed header. */
export function scrollToTarget(target: Element | string, offset = -88) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el as HTMLElement, { offset, duration: 1.2 });
  else el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
}

/**
 * Splits an element's text into words, each wrapped in a masked span, keeping inline elements
 * (<em>, <a>, <br>) intact. The full text stays readable to screen readers via aria-label.
 */
export function splitWords(el: HTMLElement, cls = "mk-wi"): HTMLElement[] {
  if (el.dataset.splitDone) return Array.from(el.querySelectorAll<HTMLElement>(`.${cls}`));
  const label = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const words: HTMLElement[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? "").split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) {
            frag.appendChild(document.createTextNode(" "));
            continue;
          }
          const outer = document.createElement("span");
          outer.className = "mk-w";
          outer.setAttribute("aria-hidden", "true");
          const inner = document.createElement("span");
          inner.className = cls;
          inner.textContent = p;
          outer.appendChild(inner);
          frag.appendChild(outer);
          words.push(inner);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName !== "BR") {
        walk(child);
      }
    }
  };
  walk(el);
  el.setAttribute("aria-label", label);
  el.dataset.splitDone = "1";
  return words;
}

/** Wires every data-attribute effect inside `root`. Returns a cleanup. */
export function bindMotion(root: HTMLElement): () => void {
  const reduced = reducedMotion();
  const fine = finePointer();
  const cleanups: (() => void)[] = [];
  const ctx = gsap.context(() => {
    // Split-text reveals.
    root.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
      const words = splitWords(el);
      if (reduced) return;
      const immediate = el.dataset.split === "now";
      gsap.fromTo(
        words,
        { yPercent: 110, rotate: 4 },
        { yPercent: 0, rotate: 0, duration: 1.1, ease: EASE, stagger: 0.045, delay: Number(el.dataset.delay ?? 0), ...(immediate ? {} : { scrollTrigger: { trigger: el, start: "top 88%", once: true } }) },
      );
    });

    // Scroll-scrubbed statement.
    root.querySelectorAll<HTMLElement>("[data-scrub-words]").forEach((el) => {
      el.querySelectorAll<HTMLElement>("[data-accent]").forEach((a) => a.classList.add("mk-accent"));
      const words = splitWords(el, "mk-sw");
      if (reduced) return;
      gsap.to(words, { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 45%", scrub: 0.6 } });
    });

    if (reduced) return;

    root.querySelectorAll<HTMLElement>("[data-rise]").forEach((el) => {
      gsap.to(el, { opacity: 1, y: 0, duration: 1.1, ease: EASE, delay: Number(el.dataset.delay ?? 0), scrollTrigger: { trigger: el, start: "top 90%", once: true } });
    });
    root.querySelectorAll<HTMLElement>("[data-stagger]").forEach((el) => {
      gsap.to(el.children, { opacity: 1, y: 0, duration: 1, ease: EASE, stagger: 0.09, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });

    root.querySelectorAll<HTMLElement>("[data-speed]").forEach((el) => {
      const speed = Number(el.dataset.speed) || 0.2;
      const trigger = el.closest("section") ?? el.parentElement ?? el;
      gsap.fromTo(el, { yPercent: -speed * 40 }, { yPercent: speed * 40, ease: "none", scrollTrigger: { trigger, start: "top bottom", end: "bottom top", scrub: true } });
    });

    root.querySelectorAll<HTMLElement>("[data-hero-drift]").forEach((el) => {
      gsap.to(el, { yPercent: 18, opacity: 0, ease: "none", scrollTrigger: { trigger: el.closest("section") ?? el, start: "top top", end: "bottom top", scrub: true } });
    });

    root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 1.6,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onUpdate: () => (el.textContent = Math.round(obj.v).toLocaleString("en-IN")),
      });
    });

    root.querySelectorAll<SVGGeometryElement>("[data-draw]").forEach((p) => {
      const len = p.getTotalLength?.() ?? 0;
      if (!len) return;
      gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: p.closest("svg") ?? p, start: "top 85%", end: "bottom 50%", scrub: 0.8 } });
    });

    root.querySelectorAll<HTMLElement>("[data-connectors]").forEach((group) => {
      gsap.fromTo(group.querySelectorAll("[data-connector]"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "left", ease: EASE, duration: 0.9, stagger: 0.25, scrollTrigger: { trigger: group, start: "top 80%", once: true } });
    });

    // Marquee: speed and direction follow scroll velocity.
    root.querySelectorAll<HTMLElement>("[data-marquee]").forEach((el) => {
      const track = el.querySelector<HTMLElement>(".mk-marquee__track");
      if (!track) return;
      const tween = gsap.to(track, { xPercent: -50, duration: Number(el.dataset.marquee) || 30, ease: "none", repeat: -1 });
      let dir = 1;
      ScrollTrigger.create({
        trigger: el,
        start: "top bottom",
        end: "bottom top",
        onUpdate: (self) => {
          dir = self.direction;
          const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 400, 4);
          gsap.to(tween, { timeScale: dir * boost, duration: 0.2, overwrite: true });
          gsap.to(tween, { timeScale: dir, duration: 1.2, delay: 0.25, overwrite: false });
        },
      });
    });

    // Pinned horizontal scroll (desktop only).
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      root.querySelectorAll<HTMLElement>("[data-hscroll]").forEach((section) => {
        const track = section.querySelector<HTMLElement>(".mk-hscroll__track");
        const meter = section.querySelector<HTMLElement>("[data-meter]");
        if (!track) return;
        const distance = () => track.scrollWidth - track.clientWidth;
        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: { trigger: section, start: "top top", end: () => `+=${distance()}`, pin: true, scrub: 0.8, invalidateOnRefresh: true, onUpdate: (s) => meter && gsap.set(meter, { scaleX: s.progress }) },
        });
        track.querySelectorAll<HTMLElement>(".mk-hscroll__card").forEach((card) => {
          gsap.fromTo(card, { opacity: 0.35, y: 30, rotate: 2 }, { opacity: 1, y: 0, rotate: 0, ease: EASE, scrollTrigger: { trigger: card, containerAnimation: tween, start: "left 85%", end: "left 50%", scrub: true } });
        });
      });
    });
    cleanups.push(() => mm.revert());
  }, root);

  // Pointer effects: fine pointers only.
  if (fine && !reduced) {
    root.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
      gsap.set(el, { transformPerspective: 900 });
      const rx = gsap.quickTo(el, "rotationX", { duration: 0.6, ease: "power3.out" });
      const ry = gsap.quickTo(el, "rotationY", { duration: 0.6, ease: "power3.out" });
      const max = Number(el.dataset.tilt) || 6;
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        ry((x - 0.5) * max * 2);
        rx(-(y - 0.5) * max * 2);
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
      };
      const leave = () => {
        rx(0);
        ry(0);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
      });
    });
    root.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
      const qx = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
      const qy = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
      const s = Number(el.dataset.magnetic) || 0.3;
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        qx((e.clientX - (r.left + r.width / 2)) * s);
        qy((e.clientY - (r.top + r.height / 2)) * s);
      };
      const leave = () => {
        qx(0);
        qy(0);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
      });
    });
  }

  // Refresh once fonts and images settle (layout shifts move trigger points).
  const refresh = () => ScrollTrigger.refresh();
  document.fonts?.ready.then(refresh).catch(() => {});
  window.addEventListener("load", refresh);
  root.querySelectorAll("img").forEach((img) => !img.complete && img.addEventListener("load", refresh, { once: true }));
  cleanups.push(() => window.removeEventListener("load", refresh));

  return () => {
    cleanups.forEach((c) => c());
    ctx.revert();
  };
}
