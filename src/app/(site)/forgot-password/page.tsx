import ForgotPasswordForm from "@/components/forgot-password-form";
import AuthShell from "@/components/site/auth-shell";

export const metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center">
      <h1 className="mk-display text-3xl tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Enter your account email and we&rsquo;ll send you a reset link.
      </p>
      <ForgotPasswordForm />
    </div>
    </AuthShell>
  );
}
