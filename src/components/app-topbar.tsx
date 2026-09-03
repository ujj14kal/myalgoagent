import { signOut } from "@/lib/auth";

export default function AppTopbar({
  user,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
}) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-black/5 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
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
