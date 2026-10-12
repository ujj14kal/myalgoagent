"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCredits } from "@/components/credits/credits-provider";

// The payment window is Razorpay's, but it opens on top of our own page with our name, logo and colour, and nothing is
// believed until the server has checked the payment's signature. Card details never touch our servers.

type Brand = { name: string; logo: string; color: string };
type Prefill = { name: string; email: string };
type SubCheckout = { keyId: string; mode: "test" | "live"; subscriptionId: string; planLabel: string; amountPaise: number; prefill: Prefill; brand: Brand };
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

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  return { busy, setBusy, error, setError, done, setDone };
}

const baseBtn = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50";

export function UpgradeButton({ plan, label, primary = true }: { plan: "TRADE" | "PRO"; label: string; primary?: boolean }) {
  const router = useRouter();
  const credits = useCredits();
  const s = useBusy();
  async function go() {
    s.setBusy(true);
    s.setError(null);
    try {
      const [{ checkout }, Razorpay] = await Promise.all([post<{ checkout: SubCheckout }>("/api/billing/checkout", { plan }), loadCheckout()]);
      await new Promise<void>((resolve, reject) => {
        const rz = new Razorpay({
          key: checkout.keyId,
          subscription_id: checkout.subscriptionId,
          name: checkout.brand.name,
          description: `${checkout.planLabel} plan · billed monthly, GST included`,
          image: checkout.brand.logo,
          theme: { color: checkout.brand.color },
          prefill: checkout.prefill,
          modal: { ondismiss: () => resolve() },
          handler: async (r: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
            try {
              await post("/api/billing/confirm", { paymentId: r.razorpay_payment_id, subscriptionId: r.razorpay_subscription_id, signature: r.razorpay_signature });
              s.setDone(`You're on ${checkout.planLabel}. Welcome!`);
              await credits.refresh?.();
              router.refresh();
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        });
        rz.on("payment.failed", (r) => reject(new Error(r.error?.description ?? "The payment didn't go through.")));
        rz.open();
      });
    } catch (e) {
      s.setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      s.setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={s.busy} className={`${baseBtn} ${primary ? "bg-brand-primary text-white hover:bg-brand-primary-light" : "bg-white text-brand-primary ring-1 ring-brand-primary/30 hover:bg-brand-primary/5"}`}>
        {s.busy && <Loader2 size={14} className="animate-spin" />} {label}
      </button>
      {s.error && <p role="alert" className="mt-2 text-xs text-[#9b1111]">{s.error}</p>}
      {s.done && <p className="mt-2 text-xs font-semibold text-[#0b6b30]">{s.done}</p>}
    </div>
  );
}

export function TopupButton({ credits: pack, price }: { credits: number; price: number }) {
  const router = useRouter();
  const meter = useCredits();
  const s = useBusy();
  async function go() {
    s.setBusy(true);
    s.setError(null);
    try {
      const [{ checkout }, Razorpay] = await Promise.all([post<{ checkout: TopupCheckout }>("/api/billing/topup", { credits: pack }), loadCheckout()]);
      await new Promise<void>((resolve, reject) => {
        const rz = new Razorpay({
          key: checkout.keyId,
          order_id: checkout.orderId,
          amount: checkout.amountPaise,
          currency: "INR",
          name: checkout.brand.name,
          description: `${checkout.credits.toLocaleString("en-IN")} credits · GST included`,
          image: checkout.brand.logo,
          theme: { color: checkout.brand.color },
          prefill: checkout.prefill,
          modal: { ondismiss: () => resolve() },
          handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              await post("/api/billing/topup/confirm", { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              s.setDone(`${checkout.credits.toLocaleString("en-IN")} credits added.`);
              await meter.refresh?.();
              router.refresh();
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        });
        rz.on("payment.failed", (r) => reject(new Error(r.error?.description ?? "The payment didn't go through.")));
        rz.open();
      });
    } catch (e) {
      s.setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      s.setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={s.busy} className="flex w-full items-center justify-between gap-2 rounded-lg bg-brand-bg px-3 py-2 text-left text-sm transition hover:bg-brand-primary/[0.07] disabled:opacity-50">
        <span><span className="num font-semibold tabular-nums">{pack.toLocaleString("en-IN")}</span> credits</span>
        <span className="num font-semibold tabular-nums text-brand-primary">{s.busy ? <Loader2 size={14} className="animate-spin" /> : `₹${price.toLocaleString("en-IN")}`}</span>
      </button>
      {s.error && <p role="alert" className="mt-1 text-xs text-[#9b1111]">{s.error}</p>}
      {s.done && <p className="mt-1 text-xs font-semibold text-[#0b6b30]">{s.done}</p>}
    </div>
  );
}

export function CancelPlanButton({ endsOn }: { endsOn: string | null }) {
  const router = useRouter();
  const s = useBusy();
  async function go() {
    if (!window.confirm(`Stop renewing your plan? You keep it${endsOn ? ` until ${endsOn}` : " until the period you've paid for ends"}, then the account moves to Free.`)) return;
    s.setBusy(true);
    s.setError(null);
    try {
      await post("/api/billing/cancel", {});
      s.setDone("Done — your plan won't renew.");
      router.refresh();
    } catch (e) {
      s.setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      s.setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={s.busy} className="text-xs font-semibold text-brand-navy/60 underline-offset-2 hover:text-brand-sell hover:underline disabled:opacity-50">
        {s.busy ? "Cancelling…" : "Cancel renewal"}
      </button>
      {s.error && <p role="alert" className="mt-1 text-xs text-[#9b1111]">{s.error}</p>}
      {s.done && <p className="mt-1 text-xs font-semibold text-[#0b6b30]">{s.done}</p>}
    </div>
  );
}
