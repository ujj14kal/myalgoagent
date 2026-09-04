"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordAction } from "@/lib/account-actions";
import { checkPassword, passwordStrength } from "@/lib/password";

const STRENGTH_COLORS = ["bg-brand-sell", "bg-brand-sell", "bg-brand-gold", "bg-brand-blue", "bg-brand-buy"];

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrength(password);
  const checks = checkPassword(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await resetPasswordAction(token, password, confirmPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/login?reset=success");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4 text-left">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">New password</label>
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
        {password && (
          <div className="mt-2">
            <div className="flex h-1.5 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`flex-1 rounded-full ${i < strength.score ? STRENGTH_COLORS[strength.score] : "bg-black/10"}`} />
              ))}
            </div>
            <p className="mt-1 text-xs text-brand-navy/50">{strength.label}</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <li className={checks.minLength ? "text-brand-buy" : "text-brand-navy/40"}>✓ 10+ characters</li>
              <li className={checks.hasUpper ? "text-brand-buy" : "text-brand-navy/40"}>✓ Uppercase letter</li>
              <li className={checks.hasLower ? "text-brand-buy" : "text-brand-navy/40"}>✓ Lowercase letter</li>
              <li className={checks.hasNumber ? "text-brand-buy" : "text-brand-navy/40"}>✓ Number</li>
              <li className={checks.hasSymbol ? "text-brand-buy" : "text-brand-navy/40"}>✓ Symbol</li>
            </ul>
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Confirm new password</label>
        <input
          required
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>
      {error && <p className="text-sm text-brand-sell">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
      >
        {submitting ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
