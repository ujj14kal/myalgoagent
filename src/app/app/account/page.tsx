import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/profile-form";
import ChangePasswordForm from "@/components/change-password-form";
import SignOutOthersButton from "@/components/sign-out-others-button";
import DangerZone from "@/components/danger-zone";
import AgentNameForm from "@/components/agent-name-form";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import RobotAvatar from "@/components/robot/robot-avatar";
import ReplayTourButton from "@/components/tutorial/replay-tour-button";
import ConnectedAccounts from "@/components/connected-accounts";
import { getLinkedProviders } from "@/lib/account-links";

const OAUTH_PROVIDERS = ["google"];

export const metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [user, strategyCount, watchlistCount, linkedProviders] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.strategy.count({ where: { userId: session.user.id } }),
    prisma.watchlistItem.count({ where: { userId: session.user.id } }),
    getLinkedProviders(session.user.id),
  ]);
  if (!user) return null;

  const memberSince = user.createdAt.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Account</h1>
      <p className="mt-1 text-sm text-brand-navy/50">Manage your profile, your agent, and account security.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
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
              <h2 className="text-sm font-semibold text-brand-navy">Your AlgoAgent</h2>
              <p className="mt-1 text-xs text-brand-navy/50">
                Give your agent a name — it&rsquo;ll use it whenever it pops up with a notification.
              </p>
              <div className="mt-4">
                <AgentNameForm initialName={user.agentName ?? DEFAULT_AGENT_NAME} />
              </div>
            </section>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-black/5 bg-white p-6">
              <h2 className="text-sm font-semibold text-brand-navy">
                {user.passwordHash ? "Change password" : "Set a password"}
              </h2>
              <p className="mt-1 text-xs text-brand-navy/50">
                {user.passwordHash
                  ? "Used to sign in with your username."
                  : "Set a password to also sign in with your username, not just a connected account."}
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
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-black/5 bg-white p-6">
              <h2 className="text-sm font-semibold text-brand-navy">Connected accounts</h2>
              <p className="mt-1 text-xs text-brand-navy/50">
                Sign in with more than one method, or disconnect one you no longer use.
              </p>
              <div className="mt-4">
                <ConnectedAccounts providers={OAUTH_PROVIDERS} linked={linkedProviders} />
              </div>
            </section>

            <section className="rounded-2xl border border-black/5 bg-white p-6">
              <h2 className="text-sm font-semibold text-brand-navy">Your data</h2>
              <p className="mt-1 text-xs text-brand-navy/50">
                Download everything associated with your account — profile, strategies, backtests,
                paper sessions, watchlist, and activity — as a single JSON file.
              </p>
              <div className="mt-4">
                <a
                  href="/api/account/export"
                  className="inline-block rounded-full border border-brand-navy/15 px-5 py-2 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
                >
                  Export my data
                </a>
              </div>
            </section>
          </div>

          <DangerZone />
        </div>

        <div className="sticky top-6 h-fit space-y-6">
          <section className="hover-lift rounded-2xl border border-black/5 bg-white p-6 text-center">
            <RobotAvatar size={64} className="mx-auto" />
            <p className="mt-3 text-sm font-semibold text-brand-navy">
              {user.agentName ?? DEFAULT_AGENT_NAME}
            </p>
            <p className="text-xs text-brand-navy/50">is watching over your account.</p>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-sm text-brand-primary">
              <ReplayTourButton />
              <span>Replay the tour</span>
            </div>
          </section>

          <section className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="text-sm font-semibold text-brand-navy">Account summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-brand-navy/50">Member since</dt>
                <dd className="font-medium text-brand-navy">{memberSince}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-navy/50">Sign-in methods</dt>
                <dd className="font-medium text-brand-navy capitalize">
                  {[...(user.passwordHash ? ["Username"] : []), ...linkedProviders].join(" + ") || "None"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-navy/50">Strategies built</dt>
                <dd className="font-medium text-brand-navy">{strategyCount}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-navy/50">Watchlist items</dt>
                <dd className="font-medium text-brand-navy">{watchlistCount}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
