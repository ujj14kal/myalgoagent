"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";

export type TourStep = {
  id: string;
  target: string | null;
  pose?: AgentPose;
  /** "side": sit beside the target (so a pointing agent points straight at it) when there's room. */
  placement?: "side";
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const GAP = 16;
const EDGE = 16;

/**
 * The first match that's actually on screen. Elements hidden by a responsive
 * `display:none` (e.g. the sidebar below md) still match but have no box, and
 * some targets exist twice — the agent's home is the sidebar button on
 * desktop and a floating button on phones.
 */
function findVisible(selector: string | null): HTMLElement | null {
  if (!selector) return null;
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.offsetParent !== null || getComputedStyle(el).position === "fixed") {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

function measure(selector: string | null): Rect | null {
  // No visible target → the step falls back to a centered card.
  const el = findVisible(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/** Put the card beside the highlighted element, never on top of it. */
function place(rect: Rect, bw: number, bh: number, prefer?: "side") {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(x, EDGE), vw - bw - EDGE);
  const clampY = (y: number) => Math.min(Math.max(y, EDGE), vh - bh - EDGE);
  const right = vw - (rect.left + rect.width);
  const below = vh - (rect.top + rect.height);

  if (prefer === "side") {
    const top = clampY(rect.top + rect.height / 2 - bh / 2);
    if (right > bw + GAP + EDGE) return { top, left: rect.left + rect.width + GAP };
    if (rect.left > bw + GAP + EDGE) return { top, left: rect.left - bw - GAP };
  }
  // Tall targets (the sidebar) read best with the card alongside.
  if (rect.height > vh * 0.45 && right > bw + GAP + EDGE) {
    return { top: clampY(rect.top + 24), left: rect.left + rect.width + GAP };
  }
  if (below > bh + GAP + EDGE) return { top: rect.top + rect.height + GAP, left: clampX(rect.left) };
  if (rect.top > bh + GAP + EDGE) return { top: rect.top - bh - GAP, left: clampX(rect.left) };
  if (right > bw + GAP + EDGE) return { top: clampY(rect.top), left: rect.left + rect.width + GAP };
  if (rect.left > bw + GAP + EDGE) return { top: clampY(rect.top), left: rect.left - bw - GAP };
  return { top: clampY(vh - bh - EDGE), left: clampX((vw - bw) / 2) };
}

export default function TutorialTour({
  open,
  steps,
  stepIndex,
  agentName,
  namingSlot,
  onNext,
  onBack,
  onSkip,
  onFinish,
}: {
  open: boolean;
  steps: TourStep[];
  stepIndex: number;
  agentName: string;
  namingSlot?: React.ReactNode;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
}) {
  const pathname = usePathname();
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!open || !step) return;
    const el = findVisible(step.target);
    // Only scroll when the target is actually off screen. Targets inside the
    // pinned sidebar (or a floating button) are always visible, and asking the
    // browser to "center" them scrolls the whole page out of place instead.
    if (el) {
      const r = el.getBoundingClientRect();
      const offScreen = r.top < 0 || r.bottom > window.innerHeight;
      if (offScreen && r.height < window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const update = () => setRect(measure(step.target));
    // Re-measure after the scroll settles, and again when the page changes
    // underneath (replaying the tour navigates to the dashboard first).
    // "scrollend" (plus a late fallback timer for browsers without it)
    // guarantees a final measure once the smooth scroll has settled, so the
    // card is never placed against a mid-scroll position.
    const t1 = setTimeout(update, 60);
    const t2 = setTimeout(update, 450);
    const t3 = setTimeout(update, 1000);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("scrollend", update, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("scrollend", update, true);
    };
  }, [open, step, pathname]);

  useLayoutEffect(() => {
    if (!rect || !cardRef.current) {
      setPos(null);
      return;
    }
    const b = cardRef.current.getBoundingClientRect();
    setPos(place(rect, b.width, b.height, step?.placement));
  }, [rect, stepIndex, step?.placement]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") (isLast ? onFinish : onNext)();
      if (e.key === "ArrowLeft" && !isFirst) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isFirst, isLast, onNext, onBack, onFinish]);

  if (!open || !step) return null;

  const pointsLeft = !!(rect && pos && rect.left + rect.width / 2 < pos.left);

  const card = (
    <motion.div
      ref={cardRef}
      key={`card-${step.id}`}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="w-[min(92vw,400px)] rounded-3xl bg-white p-5 shadow-[0_30px_60px_-20px_rgba(14,27,45,0.55)] ring-1 ring-black/5"
      style={rect ? { position: "absolute", top: pos?.top ?? -9999, left: pos?.left ?? -9999 } : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Mirrored when the target is to the card's left, so a pointing agent points at it. */}
        <span data-tour-agent className="-my-2 shrink-0" style={pointsLeft ? { transform: "scaleX(-1)" } : undefined}>
          <Agent2D pose={step.pose ?? "talk"} size={72} trackCursor={false} />
        </span>
        <div className="min-w-0 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold">
            {agentName} · {stepIndex + 1} of {steps.length}
          </p>
          <p className="mt-0.5 text-base font-bold text-brand-navy">{step.title.replace("{agent}", agentName)}</p>
          <p className="mt-1 text-sm leading-relaxed text-brand-navy/70">{step.body.replace("{agent}", agentName)}</p>
        </div>
      </div>

      {namingSlot && isFirst && <div className="mt-4">{namingSlot}</div>}

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all ${i === stepIndex ? "w-5 bg-brand-primary" : i < stepIndex ? "w-1.5 bg-brand-primary/40" : "w-1.5 bg-brand-navy/15"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSkip} className="px-2 text-xs font-medium text-brand-navy/45 hover:text-brand-navy">
            Skip
          </button>
          {!isFirst && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Previous step"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-navy/15 text-brand-navy hover:border-brand-primary hover:text-brand-primary"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? onFinish : onNext}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary-light"
          >
            {isLast ? "Let's go" : "Next"}
            {!isLast && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <Dialog.Root open={open} modal>
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={onSkip}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[80]"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Product tour</Dialog.Title>

          {rect ? (
            <motion.div
              className="absolute rounded-2xl ring-2 ring-brand-gold"
              style={{ boxShadow: "0 0 0 9999px rgba(14,27,45,0.62)", pointerEvents: "none" }}
              initial={false}
              animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
              transition={{ type: "spring", stiffness: 260, damping: 32 }}
            />
          ) : (
            <div className="absolute inset-0 bg-brand-navy/60 backdrop-blur-[2px]" />
          )}

          {rect ? card : <div className="absolute inset-0 flex items-center justify-center px-4">{card}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
