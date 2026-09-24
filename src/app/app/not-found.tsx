import Link from "next/link";
import Agent2D from "@/components/robot/agent-2d";

// Rendered inside the app shell, so a mistyped /app/... link keeps the
// sidebar and a way back — unlike the public 404.
export default function AppNotFound() {
  return (
    <div className="surface mx-auto mt-6 flex max-w-lg flex-col items-center px-6 py-10 text-center">
      <Agent2D pose="thinking" size={120} />
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-gold">404</p>
      <h1 className="mt-1 text-lg font-semibold text-brand-navy">I couldn&rsquo;t find that page</h1>
      <p className="mt-1 text-sm text-brand-navy/60">It may have moved, or the link is mistyped. Everything else is where you left it.</p>
      <Link href="/app/dashboard" className="mt-6 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-light">
        Back to dashboard
      </Link>
    </div>
  );
}
