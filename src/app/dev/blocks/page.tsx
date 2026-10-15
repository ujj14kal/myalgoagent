import { notFound } from "next/navigation";
import Harness from "./harness";

// Development only: the visual block builder on its own, to check dragging and wiring. Not served in production.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-6xl p-4">
      <Harness />
    </main>
  );
}
