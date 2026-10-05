"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { getLenis, gsap, ScrollTrigger, reducedMotion, resumeSmoothScroll, stopSmoothScroll } from "./motion";

export const SITE_LINKS = [
  { href: "/product", label: "Product" },
  { href: "/backtesting", label: "Backtesting" },
  { href: "/live-trading", label: "Live Trading" },
  { href: "/risk-management", label: "Risk" },
  { href: "/technology", label: "Technology" },
  { href: "/faq", label: "FAQ" },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Fixed header: transparent over the hero, frosted once scrolled, hides on the way down and returns on
 * the way up, and switches to its dark treatment over any section marked data-theme="dark".
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dark, setDark] = useState(false);

  // Scroll state (works with or without Lenis).
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      // Only a real move changes it: smooth scrolling ends in tiny steps that mustn't flip it back.
      if (y > last + 4 && y > 240 && !open) setHidden(true);
      else if (y < last - 4 || y <= 240) setHidden(false);
      if (Math.abs(y - last) > 4 || y <= 240) last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  // Dark treatment over dark sections.
  useEffect(() => {
    const triggers: ScrollTrigger[] = [];
    const id = requestAnimationFrame(() => {
      const darks = document.querySelectorAll<HTMLElement>("#main [data-theme='dark']");
      const update = () => setDark(triggers.some((t) => t.isActive));
      darks.forEach((el) => triggers.push(ScrollTrigger.create({ trigger: el, start: "top 40px", end: "bottom 40px", onToggle: update })));
      update();
    });
    return () => {
      cancelAnimationFrame(id);
      triggers.forEach((t) => t.kill());
      setDark(false);
    };
  }, [pathname]);

  // Close the menu on navigation; Escape closes it; scrolling pauses while it's open.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) {
      resumeSmoothScroll();
      document.body.style.overflow = "";
      return;
    }
    stopSmoothScroll();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    const r = toggleRef.current?.getBoundingClientRect();
    if (r) {
      document.documentElement.style.setProperty("--cx", `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty("--cy", `${r.top + r.height / 2}px`);
    }
    setOpen((o) => !o);
  };

  // Header entrance once per load.
  useEffect(() => {
    if (reducedMotion() || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current!.querySelectorAll("[data-h-in]"), { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "power4.out", stagger: 0.06, delay: 0.1 });
    }, ref);
    return () => ctx.revert();
  }, []);

  const onDark = dark && !open;
  return (
    <>
      <a href="#main" className="mk-skip">
        Skip to content
      </a>
      <header ref={ref} className={`mk-header ${scrolled ? "is-scrolled" : ""} ${hidden ? "is-hidden" : ""} ${onDark || open ? "is-dark" : ""}`}>
        <div className="mk-wrap flex h-[72px] items-center justify-between gap-4">
          <Link href="/" data-h-in className="flex shrink-0 items-center gap-2.5" aria-label="MyAlgoAgent home" onClick={() => pathname === "/" && getLenis()?.scrollTo(0)}>
            <Image src="/brand/icon-mark.png" alt="" width={34} height={34} priority className="rounded-[10px]" />
            <span className={`font-[family-name:var(--font-display)] text-[1.05rem] font-bold tracking-tight ${onDark || open ? "text-white" : "text-brand-primary"}`}>MyAlgoAgent</span>
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
            {SITE_LINKS.map((l) => (
              <Link key={l.href} data-h-in href={l.href} aria-current={isActive(pathname, l.href) ? "page" : undefined} className="mk-nav-link">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link data-h-in href="/login" className="mk-nav-link hidden md:inline">
              Sign in
            </Link>
            <Link data-h-in data-magnetic="0.25" href="/signup" className={`mk-btn !py-2.5 !px-4 text-sm ${onDark || open ? "mk-btn--gold" : ""}`}>
              Get started
            </Link>
            <button ref={toggleRef} type="button" className="mk-burger lg:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mk-menu" onClick={toggle}>
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>
      <div id="mk-menu" className={`mk-menu lg:hidden ${open ? "is-open" : ""}`} aria-hidden={!open} {...(!open ? { inert: true } : {})}>
        <nav aria-label="Mobile">
          {[...SITE_LINKS, { href: "/about", label: "About" }, { href: "/contact", label: "Contact" }].map((l, i) => (
            <Link key={l.href} href={l.href} className="mk-menu__link" style={{ transitionDelay: open ? `${0.15 + i * 0.05}s` : "0s" }} aria-current={isActive(pathname, l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup" className="mk-btn mk-btn--gold">
            Get started
          </Link>
          <Link href="/login" className="mk-btn mk-btn--ghost">
            Sign in
          </Link>
        </div>
      </div>
    </>
  );
}
