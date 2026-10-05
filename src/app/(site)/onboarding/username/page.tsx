import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestUsernames } from "@/lib/username";
import ChooseUsernameForm from "@/components/choose-username-form";
import AuthShell from "@/components/site/auth-shell";

export const metadata = { title: "Choose a username", robots: { index: false } };

export default async function OnboardingUsernamePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, name: true, email: true } });
  if (user?.username) redirect("/onboarding/security");

  const seedSuggestions = await suggestUsernames(user?.name ?? user?.email ?? "trader");

  return (
    <AuthShell>
      <div className="flex flex-col items-center">
      <h1 className="mk-display text-3xl tracking-tight">Choose a username</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        You&rsquo;ll use this to sign in with a password.
      </p>
      <ChooseUsernameForm seedSuggestions={seedSuggestions} />
    </div>
    </AuthShell>
  );
}
