import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestUsernames } from "@/lib/username";
import ChooseUsernameForm from "@/components/choose-username-form";

export const metadata = { title: "Choose a username", robots: { index: false } };

export default async function OnboardingUsernamePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, name: true, email: true } });
  if (user?.username) redirect("/onboarding/security");

  const seedSuggestions = await suggestUsernames(user?.name ?? user?.email ?? "trader");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-brand-navy">Choose a username</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        You&rsquo;ll use this to sign in with a password.
      </p>
      <ChooseUsernameForm seedSuggestions={seedSuggestions} />
    </div>
  );
}
