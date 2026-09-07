import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignupForm from "@/components/signup-form";

export const metadata = {
  title: "Create your account",
  robots: { index: false },
};

export default async function SignupPage() {
  const session = await auth();
  if (session) redirect("/app/dashboard");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center px-4 py-12 text-center">
      <Image src="/brand/icon-mark.png" alt="MyAlgoAgent" width={64} height={64} />
      <h1 className="mt-6 text-2xl font-bold text-brand-navy">Create your account</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-primary">
          Sign in
        </Link>
      </p>
      <SignupForm />
      <p className="mt-6 text-xs text-brand-navy/40">
        By creating an account you agree to our{" "}
        <a href="/terms" className="underline">Terms</a> and{" "}
        <a href="/privacy-policy" className="underline">Privacy Policy</a>.
      </p>
    </div>
  );
}
