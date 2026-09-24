"use client";

import { RotateCcw } from "lucide-react";
import { useTutorial } from "./tutorial-provider";

export default function ReplayTourButton({ className = "" }: { className?: string }) {
  const { startTour } = useTutorial();
  return (
    <button
      type="button"
      onClick={startTour}
      className={`inline-flex items-center gap-2 rounded-full border border-brand-primary/25 px-4 py-2 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary/5 ${className}`}
    >
      <RotateCcw size={15} />
      Replay the tour
    </button>
  );
}
