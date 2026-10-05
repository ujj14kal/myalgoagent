import ResetPasswordForm from "@/components/reset-password-form";

export const metadata = { title: "Reset password", robots: { index: false } };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-brand-navy">Set a new password</h1>
      <ResetPasswordForm token={token} />
    </div>
  );
}
