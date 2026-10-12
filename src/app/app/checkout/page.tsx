import Link from "next/link";
import { ArrowLeft, Check, FlaskConical, Lock, Receipt, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { TopupButton, UpgradeButton } from "@/components/billing/razorpay-buttons";
import { billFor, parseItem, type Bill, type CheckoutItem } from "@/lib/billing/bill";
import { rupees } from "@/lib/billing/invoice";
import { razorpayKeys, razorpayMode } from "@/lib/billing/razorpay";
import { RAZORPAY_PLAN_ENV } from "@/lib/billing/brand";
import { snapshot } from "@/lib/credits/service";
import { PLANS, TOPUP_PACKS, withGst } from "@/lib/credits/config";
import { ShoppingCart } from "lucide-react";
import BillingBrand from "@/components/billing/billing-brand";

export const metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-IN");

function Steps({ at }: { at: 1 | 2 }) {
  const steps = ["Choose", "Review and pay", "Done"];
  return (
    <ol className="mb-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-base font-semibold text-brand-navy/45 sm:gap-x-4" aria-label="Checkout steps">
      {steps.map((s, i) => (
        <li key={s} className={`flex items-center gap-2.5 sm:gap-3 ${i + 1 === at ? "text-brand-primary" : i + 1 < at ? "text-brand-navy/70" : ""}`}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${i + 1 <= at ? "bg-brand-primary text-white" : "bg-brand-navy/10"}`}>{i + 1 < at ? <Check size={15} /> : i + 1}</span>
          {s}
          {i < steps.length - 1 && <span className="ml-1 text-brand-navy/25 sm:ml-2">—</span>}
        </li>
      ))}
    </ol>
  );
}

function Chooser({ plan, canTopUp, enabled }: { plan: string; canTopUp: boolean; enabled: boolean }) {
  return (
    <div className="space-y-6">
      <Steps at={1} />
      <Card className="p-5">
        <CardHeader title="Choose a plan" subtitle="Prices are before 18% GST, which is added at checkout. Cancel any time." icon={ShoppingCart} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["TRADE", "PRO"] as const).map((p) => {
            const spec = PLANS[p];
            const here = plan === p;
            const lower = plan === "PRO" && p === "TRADE";
            return (
              <div key={p} className={`flex min-w-0 flex-col rounded-2xl border p-4 ${here ? "border-brand-primary bg-brand-primary/[0.04]" : "border-brand-navy/10"}`}>
                <p className="flex items-center gap-2 font-bold text-brand-navy">
                  {spec.label}
                  {here && <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold text-white">current</span>}
                </p>
                <p className="num mt-1 text-2xl font-bold tabular-nums text-brand-navy">₹{fmt(spec.price ?? 0)}<span className="text-sm font-normal text-brand-navy/50"> + GST /month</span></p>
                <p className="num text-xs text-brand-navy/50">{rupees(withGst(spec.price ?? 0).totalPaise)} with GST</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-brand-navy/70">
                  <li className="flex gap-2"><Check size={14} className="mt-1 shrink-0 text-brand-primary" /><span>{fmt(spec.monthlyCredits)} credits a month</span></li>
                  <li className="flex gap-2"><Check size={14} className="mt-1 shrink-0 text-brand-primary" /><span>Voice and intraday backtests</span></li>
                  <li className="flex gap-2"><Check size={14} className="mt-1 shrink-0 text-brand-primary" /><span>{spec.slots.live} live strategies, {spec.slots.forward} forward tests</span></li>
                </ul>
                {here || lower ? (
                  <p className="mt-4 text-xs text-brand-navy/50">{here ? "You're on this plan." : "You're on a higher plan."}</p>
                ) : (
                  <Link href={`/app/checkout?item=plan:${p}`} aria-disabled={!enabled} className={`mt-4 rounded-full bg-brand-primary px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-primary-light ${enabled ? "" : "pointer-events-none opacity-50"}`}>
                    Choose {spec.label}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="p-5">
        <CardHeader title="Top up credits" subtitle={canTopUp ? "Kept for 12 months and used after your monthly credits" : "Top-ups need a Trade or Pro plan"} icon={ShoppingCart} />
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {TOPUP_PACKS.map((t) => (
            <li key={t.credits}>
              <Link href={`/app/checkout?item=topup:${t.credits}`} aria-disabled={!canTopUp || !enabled} className={`flex flex-col rounded-xl bg-brand-bg px-4 py-3 transition hover:bg-brand-primary/[0.07] ${canTopUp && enabled ? "" : "pointer-events-none opacity-50"}`}>
                <span className="num text-lg font-bold tabular-nums text-brand-navy">{fmt(t.credits)} <span className="text-xs font-medium text-brand-navy/50">credits</span></span>
                <span className="num text-sm font-semibold tabular-nums text-brand-primary">₹{fmt(t.price)} <span className="text-xs font-normal text-brand-navy/50">+ GST</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function BillCard({ bill, name, email, testMode }: { bill: Bill; name: string; email: string; testMode: boolean }) {
  const total = rupees(bill.totalPaise);
  const row = "flex items-baseline justify-between gap-4 py-2";
  return (
    <div className="space-y-6">
      <Steps at={2} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="min-w-0 p-5 lg:col-span-3">
          <CardHeader title={bill.title} subtitle={bill.subtitle} icon={Receipt} />
          <ul className="mt-4 space-y-2 text-sm text-brand-navy/75">
            {bill.perks.map((p) => (
              <li key={p} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand-primary" /><span className="min-w-0 break-words">{p}</span></li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl bg-brand-bg p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/45">Billed to</p>
            <p className="mt-1 break-words font-semibold text-brand-navy">{name || email}</p>
            <p className="break-all text-brand-navy/60">{email}</p>
            <p className="mt-2 text-xs text-brand-navy/50">Your invoice is emailed to this address and is always available under <Link href="/app/account/payments" className="font-semibold text-brand-primary hover:underline">Payments & invoices</Link>.</p>
          </div>
        </Card>
        <Card className="min-w-0 p-5 lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
          <BillingBrand className="mb-4" />
          <CardHeader title="Your bill" subtitle="Price plus 18% GST" icon={Receipt} />
          <dl className="mt-3 divide-y divide-brand-navy/[0.07] text-sm">
            <div className={row}><dt className="min-w-0 text-brand-navy/70">{bill.title}<span className="block text-xs text-brand-navy/45">Price, before GST</span></dt><dd className="num shrink-0 font-semibold tabular-nums text-brand-navy">{rupees(bill.taxablePaise)}</dd></div>
            <div className={row}><dt className="min-w-0 text-brand-navy/70">GST @ {bill.gstRate}%<span className="block text-xs text-brand-navy/45">Added to the price</span></dt><dd className="num shrink-0 font-semibold tabular-nums text-brand-navy">{rupees(bill.gstPaise)}</dd></div>
            <div className="flex items-baseline justify-between gap-4 pt-3"><dt className="font-bold text-brand-navy">Total to pay{bill.recurring ? " today" : ""}</dt><dd className="num shrink-0 text-xl font-bold tabular-nums text-brand-navy">{total}</dd></div>
          </dl>
          {bill.recurring && <p className="mt-3 text-xs text-brand-navy/55">Then {total} every month on the same date, until you cancel under Plan, credits & billing. No cancellation fee.</p>}
          {testMode && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-brand-gold/10 px-3 py-2 text-xs text-brand-navy/75">
              <FlaskConical size={14} className="mt-0.5 shrink-0 text-brand-gold" />
              <span>Test mode: no real money moves. Use test card <span className="num font-semibold">4111 1111 1111 1111</span> with any future expiry and any CVV, or UPI <span className="font-semibold">success@razorpay</span>.</span>
            </p>
          )}
          <div className="mt-4">
            {bill.item.kind === "plan" ? (
              <UpgradeButton plan={bill.item.plan} label={`Pay ${total} securely`} wide />
            ) : (
              <TopupButton credits={bill.item.credits} price={bill.taxablePaise / 100} variant="pay" label={`Pay ${total} securely`} />
            )}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-brand-navy/55">
            <Lock size={13} className="mt-0.5 shrink-0" />
            <span>Pay by UPI, card or netbanking in Razorpay&rsquo;s secure window. Your card details never reach MyAlgoAgent.</span>
          </p>
          <p className="mt-2 flex items-start gap-2 text-xs text-brand-navy/55">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>By paying you agree to our <Link href="/terms" className="font-semibold text-brand-primary hover:underline">Terms</Link>. MyAlgoAgent gives no investment advice.</span>
          </p>
        </Card>
      </div>
    </div>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const sp = await searchParams;
  const keys = razorpayKeys();
  const enabled = !!keys && !!process.env[RAZORPAY_PLAN_ENV.TRADE] && !!process.env[RAZORPAY_PLAN_ENV.PRO];
  const [snap, user] = await Promise.all([snapshot(userId), prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })]);
  const item: CheckoutItem | null = parseItem(sp.item);
  const testMode = keys ? razorpayMode(keys.keyId) === "test" : false;

  let problem: string | null = null;
  if (!enabled) problem = "Online payment isn't switched on yet. Write to support and we'll set your plan up.";
  else if (item?.kind === "plan" && snap.plan === item.plan && !snap.trial) problem = `You're already on the ${PLANS[item.plan].label} plan.`;
  else if (item?.kind === "plan" && item.plan === "TRADE" && snap.plan === "PRO") problem = "You're on the Pro plan, which includes everything in Trade.";
  else if (item?.kind === "topup" && snap.plan === "FREE" && !snap.trial) problem = "Top-ups are for Trade and Pro plans. Choose a plan first.";
  else if (sp.item && !item) problem = "We couldn't find that item.";

  return (
    <div>
      <PageHeader title="Checkout" icon={ShoppingCart} description="Choose a plan or top up credits, see exactly what you pay and why, then pay securely with Razorpay." />
      {item && (
        <Link href="/app/checkout" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy/55 hover:text-brand-primary">
          <ArrowLeft size={13} /> Back to plans and top-ups
        </Link>
      )}
      {problem ? (
        <div className="space-y-4">
          <p role="status" className="rounded-xl bg-brand-gold/10 px-4 py-3 text-sm text-brand-navy">{problem} <Link href="/app/support" className="font-semibold text-brand-primary hover:underline">Contact support</Link></p>
          <Chooser plan={snap.plan} canTopUp={snap.plan !== "FREE" || !!snap.trial} enabled={enabled} />
        </div>
      ) : item ? (
        <BillCard bill={billFor(item)} name={user?.name ?? ""} email={user?.email ?? ""} testMode={testMode} />
      ) : (
        <Chooser plan={snap.plan} canTopUp={snap.plan !== "FREE" || !!snap.trial} enabled={enabled} />
      )}
    </div>
  );
}
