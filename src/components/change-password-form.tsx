"use client";

import { useState } from "react";
import { changePasswordAction } from "@/lib/profile-actions";
import { checkPassword, passwordStrength } from "@/lib/password";

const STRENGTH_COLORS = ["bg-brand-sell", "bg-brand-sell", "bg-brand-gold", "bg-brand-blue", "bg-brand-buy"];

export default function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrength(newPassword);
  const checks = checkPassword(newPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    const result = await changePasswordAction({ currentPassword, newPassword, confirmPassword });
    setSubmitting(false);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage({ type: "ok", text: "Password updated." });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {hasPassword && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Current password</label>
          <input
            required
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">New password</label>
        <input
          required
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
        {newPassword && (
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
      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-brand-buy" : "text-brand-sell"}`}>{message.text}</p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
      >
        {submitting ? "Updating…" : hasPassword ? "Change password" : "Set password"}
      </button>
    </form>
  );
}
