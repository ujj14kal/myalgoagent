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
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        <polyline points="23 4 23 10 17 10" />
      </svg>
    </button>
  );
}
