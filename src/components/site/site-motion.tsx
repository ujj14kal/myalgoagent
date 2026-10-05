"use client";

import { useEffect } from "react";
import { bindMotion, getLenis, scrollToTarget, startSmoothScroll, ScrollTrigger } from "./motion";


/** Mounted once in the marketing layout: smooth scroll and in-page anchor scrolling. */
export default function SiteMotion() {
  useEffect(() => {
    startSmoothScroll();
    document.documentElement.classList.add("mk-ready");
    // In-page anchors scroll through Lenis, clear of the fixed header.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const url = new URL(a.href, location.href);
      if (url.pathname !== location.pathname || !url.hash || url.hash === "#") return;
      const target = document.querySelector(decodeURIComponent(url.hash));
      if (!target) return;
      e.preventDefault();
      history.pushState(null, "", url.hash);
      scrollToTarget(target);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}

/**
 * Put last inside a page: binds the data-attribute effects once THIS page has hydrated (pages
 * hydrate after the layout, so binding from the layout would edit server HTML React hasn't adopted yet).
 */
export function PageMotion() {
  useEffect(() => {
    const root = document.getElementById("main");
    if (!root) return;
    // A new page starts at the top (Lenis keeps its own position across client navigations).
    if (!location.hash) getLenis()?.scrollTo(0, { immediate: true });
    const cleanup = bindMotion(root);
    ScrollTrigger.refresh();
    if (location.hash) {
      const t = document.querySelector(decodeURIComponent(location.hash));
      if (t) setTimeout(() => scrollToTarget(t), 60);
    }
    return cleanup;
  }, []);
  return null;
}
