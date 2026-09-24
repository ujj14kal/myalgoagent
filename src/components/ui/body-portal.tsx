"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Renders children at the end of <body>. Needed for full-screen overlays
 * opened from inside the sticky headers: those use `backdrop-filter`, which
 * makes a `position: fixed` descendant size itself to the header instead of
 * the viewport — the overlay would render as a thin strip.
 */
export default function BodyPortal({ children }: { children: React.ReactNode }) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  return isClient ? createPortal(children, document.body) : null;
}
