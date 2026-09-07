"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import RobotAvatar from "@/components/robot/robot-avatar";
import type { RobotPose } from "@/components/robot/robot-mascot";

export type TourStep = {
  id: string;
  target: string | null;
  pose?: RobotPose;
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

function measure(selector: string | null): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  // an element hidden by a responsive `display:none` (e.g. the sidebar
  // below the md breakpoint) still matches the selector but has no box —
  // treat that the same as "not found" rather than spotlighting a 0x0 rect.
  if (!el || (el as HTMLElement).offsetParent === null) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
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
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!open || !step) return;

    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });

    const update = () => setRect(measure(step.target));
    const t = setTimeout(update, el ? 250 : 0);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step]);

  if (!open || !step) return null;

  const bubbleTop = rect ? Math.min(rect.top + rect.height + 16, window.innerHeight - 260) : undefined;
  const bubbleLeft = rect ? Math.min(Math.max(rect.left, 16), window.innerWidth - 356) : undefined;

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

          {/* dim + spotlight cut-out */}
          {rect ? (
            <motion.div
              key={step.id}
              className="absolute rounded-2xl ring-2 ring-brand-gold"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                boxShadow: "0 0 0 9999px rgba(14,27,45,0.6)",
                pointerEvents: "none",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            />
          ) : (
            <div className="absolute inset-0 bg-brand-navy/60" />
          )}

          {/* speech bubble — centered steps use a flex wrapper so motion's own
              `transform` (for the scale animation) never has to share the
              CSS transform property with manual centering math. */}
          <div
            className={rect ? "contents" : "absolute inset-0 flex items-center justify-center px-4"}
          >
            <motion.div
              key={`bubble-${step.id}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="absolute w-[min(90vw,340px)] rounded-2xl bg-white p-5 shadow-2xl"
              style={rect ? { top: bubbleTop, left: bubbleLeft } : { position: "relative", top: "auto", left: "auto" }}
            >
              <div className="flex items-start gap-3">
                <RobotAvatar pose={step.pose ?? "talk"} size={44} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-navy">{step.title.replace("{agent}", agentName)}</p>
                  <p className="mt-1 text-sm text-brand-navy/70">{step.body.replace("{agent}", agentName)}</p>
                </div>
              </div>

              {namingSlot && isFirst && <div className="mt-4">{namingSlot}</div>}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-xs font-medium text-brand-navy/50 hover:text-brand-navy"
                >
                  Skip tour
                </button>
                <div className="flex items-center gap-2">
                  {!isFirst && (
                    <button
                      type="button"
                      onClick={onBack}
                      className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy hover:border-brand-primary"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={isLast ? onFinish : onNext}
                    className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-light"
                  >
                    {isLast ? "Let's go" : "Next"}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] text-brand-navy/30">
                Step {stepIndex + 1} of {steps.length}
              </p>
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
