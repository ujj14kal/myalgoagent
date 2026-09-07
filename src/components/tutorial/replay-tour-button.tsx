"use client";

import { useTutorial } from "./tutorial-provider";

export default function ReplayTourButton({ className = "" }: { className?: string }) {
  const { startTour } = useTutorial();
  return (
    <button
      type="button"
      onClick={startTour}
      aria-label="Replay product tour"
      title="Replay product tour"
      className={`text-brand-navy/60 hover:text-brand-primary ${className}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l2.5 2.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
