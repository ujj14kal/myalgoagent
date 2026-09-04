import VerifyDeletionForm from "@/components/verify-deletion-form";

export const metadata = { title: "Confirm account deletion", robots: { index: false } };

export default function VerifyDeletionPage() {
  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="text-2xl font-bold text-brand-navy">Confirm account deletion</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        We sent a 6-digit code to your account email. Enter it below to
        schedule your account for deletion.
      </p>
      <VerifyDeletionForm />
    </div>
  );
}
