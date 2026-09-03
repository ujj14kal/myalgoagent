import { auth, signOut } from "@/lib/auth";

export const metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const session = await auth();

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-brand-navy">Account</h1>
      <div className="mt-6 rounded-2xl border border-black/5 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
          Name
        </p>
        <p className="mt-1 text-sm text-brand-navy">{session?.user?.name ?? "—"}</p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
          Email
        </p>
        <p className="mt-1 text-sm text-brand-navy">{session?.user?.email}</p>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="rounded-full border border-brand-navy/15 px-5 py-2 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
