"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCredits } from "@/components/credits/credits-provider";
import { PLANS } from "@/lib/credits/config";
import PaymentOverlay, { type PaymentOverlayState } from "./payment-overlay";

// The payment window is Razorpay's, but it opens on top of our own page with our name, logo and colour, and nothing is
// believed until the server has checked the payment's signature. Card details never touch our servers. When Razorpay
// hands control back, our own screen takes over: "confirming…", then the celebration (see payment-overlay.tsx).

type Brand = { name: string; logo: string; color: string };
type Prefill = { name: string; email: string };
type SubCheckout = { keyId: string; mode: "test" | "live"; subscriptionId: string; plan: "TRADE" | "PRO"; planLabel: string; amountPaise: number; prefill: Prefill; brand: Brand };
type TopupCheckout = { keyId: string; mode: "test" | "live"; orderId: string; credits: number; amountPaise: number; prefill: Prefill; brand: Brand };

type RazorpayCtor = new (o: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: { error?: { description?: string } }) => void): void };
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Payment window didn't load.")));
    s.onerror = () => reject(new Error("Couldn't reach the payment window. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!res.ok || !j.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
  return j;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString("en-IN");
const MIN_PROCESSING_MS = 1600; // long enough to read "confirming", never an instant flash

function perksOf(plan: "TRADE" | "PRO"): string[] {
  const s = PLANS[plan];
  return [`${fmt(s.monthlyCredits)} credits every month, ready now`, "AI assistant with voice and intraday backtests", `Up to ${s.slots.live} live strategies and ${s.slots.forward} forward tests`, "Your own static IP for live orders"];
}

/** Opens Razorpay's window and resolves when the customer has paid (with the proof to send us), cancelled (null) or it failed (throws). */
function openRazorpay<T>(Razorpay: RazorpayCtor, options: Record<string, unknown>): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const rz = new Razorpay({ ...options, modal: { ondismiss: () => resolve(null) }, handler: (r: T) => resolve(r) });
    rz.on("payment.failed", (r) => reject(new Error(r.error?.description ?? "The payment didn't go through.")));
    rz.open();
  });
}

const baseBtn = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50";

/** Shared by both buttons: the busy flag, an error shown under the button, and the full-screen overlay. */
function useCheckout() {
  const router = useRouter();
  const meter = useCredits();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<PaymentOverlayState | null>(null);
  const close = useCallback(() => {
    setOverlay(null);
    meter.refresh?.();
    router.refresh();
  }, [meter, router]);
  return { busy, setBusy, error, setError, overlay, setOverlay, close };
}

export function UpgradeButton({ plan, label, primary = true, wide = false }: { plan: "TRADE" | "PRO"; label: string; primary?: boolean; wide?: boolean }) {
  const c = useCheckout();
  async function go() {
    c.setBusy(true);
    c.setError(null);
    try {
      const [{ checkout }, Razorpay] = await Promise.all([post<{ checkout: SubCheckout }>("/api/billing/checkout", { plan }), loadCheckout()]);
      const paid = await openRazorpay<{ razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }>(Razorpay, {
        key: checkout.keyId,
        subscription_id: checkout.subscriptionId,
        name: checkout.brand.name,
        description: `${checkout.planLabel} plan · billed monthly, GST included`,
        image: checkout.brand.logo,
        theme: { color: checkout.brand.color },
        prefill: checkout.prefill,
      });
      if (!paid) return; // closed the window: nothing happened
      c.setOverlay({ kind: "processing", what: `your ${checkout.planLabel} plan` });
      try {
        await Promise.all([post("/api/billing/confirm", { paymentId: paid.razorpay_payment_id, subscriptionId: paid.razorpay_subscription_id, signature: paid.razorpay_signature }), wait(MIN_PROCESSING_MS)]);
        c.setOverlay({ kind: "success", variant: "plan", planLabel: checkout.planLabel, perks: perksOf(checkout.plan) });
      } catch (e) {
        c.setOverlay({ kind: "error", message: e instanceof Error ? e.message : "We couldn't confirm the payment." });
      }
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      c.setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={c.busy} className={`${baseBtn} ${wide ? "w-full py-3 text-base" : ""} ${primary ? "bg-brand-primary text-white hover:bg-brand-primary-light" : "bg-white text-brand-primary ring-1 ring-brand-primary/30 hover:bg-brand-primary/5"}`}>
        {c.busy && <Loader2 size={14} className="animate-spin" />} {label}
      </button>
      {c.error && <p role="alert" className="mt-2 text-xs text-[#9b1111]">{c.error}</p>}
      <PaymentOverlay state={c.overlay} onClose={c.close} />
    </div>
  );
}

export function TopupButton({ credits: pack, price, variant = "row", label }: { credits: number; price: number; variant?: "row" | "pay"; label?: string }) {
  const c = useCheckout();
  async function go() {
    c.setBusy(true);
    c.setError(null);
    try {
      const [{ checkout }, Razorpay] = await Promise.all([post<{ checkout: TopupCheckout }>("/api/billing/topup", { credits: pack }), loadCheckout()]);
      const paid = await openRazorpay<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }>(Razorpay, {
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amountPaise,
        currency: "INR",
        name: checkout.brand.name,
        description: `${fmt(checkout.credits)} credits · GST included`,
        image: checkout.brand.logo,
        theme: { color: checkout.brand.color },
        prefill: checkout.prefill,
      });
      if (!paid) return;
      c.setOverlay({ kind: "processing", what: `your ${fmt(checkout.credits)} credits` });
      try {
        await Promise.all([post("/api/billing/topup/confirm", { orderId: paid.razorpay_order_id, paymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature }), wait(MIN_PROCESSING_MS)]);
        c.setOverlay({ kind: "success", variant: "topup", credits: checkout.credits });
      } catch (e) {
        c.setOverlay({ kind: "error", message: e instanceof Error ? e.message : "We couldn't confirm the payment." });
      }
    } catch (e) {
      c.setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      c.setBusy(false);
    }
  }
  return (
    <div>
      {variant === "pay" ? (
        <button type="button" onClick={go} disabled={c.busy} className={`${baseBtn} w-full bg-brand-primary py-3 text-base text-white hover:bg-brand-primary-light`}>
          {c.busy && <Loader2 size={14} className="animate-spin" />} {label ?? `Pay ₹${fmt(price)}`}
        </button>
      ) : (
        <button type="button" onClick={go} disabled={c.busy} className="flex w-full items-center justify-between gap-2 rounded-lg bg-brand-bg px-3 py-2 text-left text-sm transition hover:bg-brand-primary/[0.07] disabled:opacity-50">
        <span><span className="num font-semibold tabular-nums">{fmt(pack)}</span> credits</span>
        <span className="num font-semibold tabular-nums text-brand-primary">{c.busy ? <Loader2 size={14} className="animate-spin" /> : `₹${fmt(price)}`}</span>
      </button>
      )}
      {c.error && <p role="alert" className="mt-1 text-xs text-[#9b1111]">{c.error}</p>}
      <PaymentOverlay state={c.overlay} onClose={c.close} />
    </div>
  );
}

export function CancelPlanButton({ endsOn }: { endsOn: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function go() {
    if (!window.confirm(`Stop renewing your plan? You keep it${endsOn ? ` until ${endsOn}` : " until the period you've paid for ends"}, then the account moves to Free.`)) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/billing/cancel", {});
      setDone("Done — your plan won't renew.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className="text-xs font-semibold text-brand-navy/60 underline-offset-2 hover:text-brand-sell hover:underline disabled:opacity-50">
        {busy ? "Cancelling…" : "Cancel renewal"}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-[#9b1111]">{error}</p>}
      {done && <p className="mt-1 text-xs font-semibold text-[#0b6b30]">{done}</p>}
    </div>
  );
}
