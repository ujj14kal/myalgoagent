"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginWithPasswordAction, requestMagicLinkAction } from "@/lib/account-actions";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await loginWithPasswordAction(username, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/app/dashboard");
  }

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await requestMagicLinkAction(email);
    setSubmitting(false);
    setMagicLinkSent(true);
  }

  return (
    <div className="mt-8 w-full">
      <div className="flex rounded-full border border-brand-navy/15 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`flex-1 rounded-full py-1.5 ${mode === "password" ? "bg-brand-primary text-white" : "text-brand-navy/60"}`}
        >
          Username &amp; password
        </button>
        <button
          type="button"
          onClick={() => setMode("magic-link")}
          className={`flex-1 rounded-full py-1.5 ${mode === "magic-link" ? "bg-brand-primary text-white" : "text-brand-navy/60"}`}
        >
          Email magic link
        </button>
      </div>

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-3 text-left">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Username</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Password</label>
              <Link href="/forgot-password" className="text-xs text-brand-primary">Forgot password?</Link>
            </div>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          {error && <p className="text-sm text-brand-sell">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : magicLinkSent ? (
        <p className="mt-6 text-sm text-brand-navy/70">
          If an account exists for <strong>{email}</strong>, a sign-in link has been sent. Check your inbox.
        </p>
      ) : (
        <form onSubmit={handleMagicLinkSubmit} className="mt-6 space-y-3 text-left">
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
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-brand-navy/60">
        Don&rsquo;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-brand-primary">Sign up</Link>
      </p>
    </div>
  );
}
