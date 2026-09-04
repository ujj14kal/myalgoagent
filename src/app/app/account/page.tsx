import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/profile-form";
import ChangePasswordForm from "@/components/change-password-form";
import SignOutOthersButton from "@/components/sign-out-others-button";
import DangerZone from "@/components/danger-zone";

export const metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return null;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">Account</h1>

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-navy">Profile</h2>
        <p className="mt-1 text-xs text-brand-navy/50">{user.email}</p>
        <div className="mt-4">
          <ProfileForm
            initialName={user.name ?? ""}
            initialUsername={user.username ?? ""}
            initialPhone={user.phone ?? ""}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-navy">
          {user.passwordHash ? "Change password" : "Set a password"}
        </h2>
        <p className="mt-1 text-xs text-brand-navy/50">
          {user.passwordHash
            ? "Used to sign in with your username."
            : "You signed up with Google — set a password to also sign in with your username."}
        </p>
        <div className="mt-4">
          <ChangePasswordForm hasPassword={!!user.passwordHash} />
        </div>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-navy">Sessions</h2>
        <p className="mt-1 text-xs text-brand-navy/50">
          Signed in as {user.name ?? user.email} on this device.
        </p>
        <div className="mt-4 space-y-3">
          <SignOutOthersButton />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-full border border-brand-navy/15 px-5 py-2 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>

      <DangerZone />
    </div>
  );
}
