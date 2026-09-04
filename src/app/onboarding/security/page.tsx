import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata = { title: "Secure your account", robots: { index: false } };

export default async function OnboardingSecurityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-brand-navy">Secure your account</h1>
      <p className="mt-3 text-sm text-brand-navy/70">
        We strongly recommend setting up two-factor authentication (an
        authenticator app or a passkey) now. For your security, it becomes
        required within 2 days of signing up — you won&rsquo;t be able to use
        the app further until it&rsquo;s set up.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3">
        <Link
          href="/app/account/security/totp"
          className="rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light"
        >
          Set up 2FA now
        </Link>
        <Link
          href="/app/dashboard"
          className="rounded-full border border-brand-navy/15 px-6 py-3 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
        >
          Remind me later
        </Link>
      </div>
    </div>
  );
}
