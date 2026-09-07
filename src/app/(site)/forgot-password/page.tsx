import ForgotPasswordForm from "@/components/forgot-password-form";

export const metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-brand-navy">Reset your password</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Enter your account email and we&rsquo;ll send you a reset link.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
