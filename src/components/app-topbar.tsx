import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";
import MobileNavDrawer from "@/components/mobile-nav-drawer";
import TopbarTitle from "@/components/topbar-title";
import { avatarInitials } from "@/lib/avatar";

export default function AppTopbar({
  user,
  unreadCount = 0,
  agentName,
  liveSessions,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  unreadCount?: number;
  agentName: string;
  liveSessions: number;
}) {
  const displayName = user.name ?? user.email ?? "";
  const initials = avatarInitials(user.name, user.email);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65 md:px-6">
      <MobileNavDrawer agentName={agentName} liveSessions={liveSessions} />
      <TopbarTitle />
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Link
          href="/app/notifications"
          data-tour="notifications-bell"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-brand-navy/60 transition-colors hover:bg-brand-primary/5 hover:text-brand-primary"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell size={19} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-sell px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        <Link
          href="/app/account"
          className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-brand-primary/5 sm:flex"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-white" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-primary-light text-xs font-semibold text-white">
              {initials}
            </span>
          )}
          <span className="max-w-[12rem] truncate text-sm font-medium text-brand-navy">{displayName}</span>
        </Link>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-full border border-brand-navy/10 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-navy/80 transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
