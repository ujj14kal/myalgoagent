"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkUsernameAction, signupAction } from "@/lib/account-actions";
import { checkPassword, passwordStrength } from "@/lib/password";

const STRENGTH_COLORS = ["bg-brand-sell", "bg-brand-sell", "bg-brand-gold", "bg-brand-blue", "bg-brand-buy"];

export default function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3) return;
    const handle = setTimeout(async () => {
      setUsernameStatus("checking");
      const result = await checkUsernameAction(trimmed);
      setUsernameStatus(result.available ? "available" : "taken");
      setSuggestions(result.suggestions);
    }, 400);
    return () => clearTimeout(handle);
  }, [username]);

  const displayedUsernameStatus = username.trim().length < 3 ? "idle" : usernameStatus;

  const strength = passwordStrength(password);
  const checks = checkPassword(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (displayedUsernameStatus !== "available") {
      setError("Choose an available username first.");
      return;
    }
    setSubmitting(true);
    const result = await signupAction({ fullName, email, phone, username, password, confirmPassword });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/onboarding/security");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4 text-left">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
          Full name (as per govt. ID)
        </label>
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Email</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Phone number</label>
        <input
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Username</label>
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
        {displayedUsernameStatus === "checking" && <p className="mt-1 text-xs text-brand-navy/40">Checking availability…</p>}
        {displayedUsernameStatus === "available" && <p className="mt-1 text-xs text-brand-buy">@{username} is available</p>}
        {displayedUsernameStatus === "taken" && (
          <div className="mt-1 text-xs text-brand-sell">
            <p>That username is taken.</p>
            {suggestions.length > 0 && (
              <p className="mt-1 text-brand-navy/60">
                Try:{" "}
                {suggestions.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setUsername(s)}
                    className="font-semibold text-brand-primary underline underline-offset-2"
                  >
                    {s}
                    {i < suggestions.length - 1 ? ", " : ""}
                  </button>
                ))}
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Password</label>
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
                <div
                  key={i}
                  className={`flex-1 rounded-full ${i < strength.score ? STRENGTH_COLORS[strength.score] : "bg-black/10"}`}
                />
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
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Confirm password</label>
        <input
          required
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
        {confirmPassword && confirmPassword !== password && (
          <p className="mt-1 text-xs text-brand-sell">Passwords do not match.</p>
        )}
      </div>

      {error && <p className="text-sm text-brand-sell">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
