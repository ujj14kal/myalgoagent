import Link from "next/link";
import { signOut } from "@/lib/auth";

export default function AppTopbar({
  user,
  unreadCount = 0,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  unreadCount?: number;
}) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-black/5 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <Link href="/app/notifications" className="relative text-brand-navy/60 hover:text-brand-primary" aria-label="Notifications">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M12 2a6 6 0 0 0-6 6v3.28a2 2 0 0 1-.53 1.36L4 14.5A1 1 0 0 0 4.74 16h14.52a1 1 0 0 0 .74-1.5l-1.47-1.86A2 2 0 0 1 18 11.28V8a6 6 0 0 0-6-6Zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-sell px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <span className="text-sm text-brand-navy/70">
          {user.name ?? user.email}
        </span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
