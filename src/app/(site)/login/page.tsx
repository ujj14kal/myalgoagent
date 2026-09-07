import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import LoginForm from "@/components/login-form";

export const metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/app/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center px-4 py-12 text-center">
      <Image src="/brand/icon-mark.png" alt="MyAlgoAgent" width={64} height={64} />
      <h1 className="mt-6 text-2xl font-bold text-brand-navy">
        Sign in to MyAlgoAgent
      </h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Access your strategies, backtests and portfolio.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/app/dashboard" });
        }}
        className="mt-8 w-full"
      >
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-full border border-brand-navy/15 bg-white px-6 py-3 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          Continue with Google
        </button>
      </form>

      <div className="mt-6 flex w-full items-center gap-3 text-xs text-brand-navy/40">
        <div className="h-px flex-1 bg-black/10" />
        or
        <div className="h-px flex-1 bg-black/10" />
      </div>

      <LoginForm />

      <p className="mt-6 text-xs text-brand-navy/40">
        By continuing you agree to our{" "}
        <a href="/terms" className="underline">Terms</a> and{" "}
        <a href="/privacy-policy" className="underline">Privacy Policy</a>.
      </p>
    </div>
  );
}
