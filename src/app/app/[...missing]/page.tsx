import { notFound } from "next/navigation";

// Any unmatched /app/* URL lands here so the in-shell 404 (app/not-found.tsx)
// renders with the sidebar, instead of the bare public 404.
export default function Missing() {
  notFound();
}
