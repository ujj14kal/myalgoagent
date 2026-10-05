import ResetPasswordForm from "@/components/reset-password-form";
import AuthShell from "@/components/site/auth-shell";

export const metadata = { title: "Reset password", robots: { index: false } };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell>
      <div className="flex flex-col items-center">
      <h1 className="mk-display text-3xl tracking-tight">Set a new password</h1>
      <ResetPasswordForm token={token} />
    </div>
    </AuthShell>
  );
}
