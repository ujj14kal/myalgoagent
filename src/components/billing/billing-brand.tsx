/** The MyAlgoAgent wordmark that heads billing screens: the white logo on the brand purple, the same as on invoices. */
export default function BillingBrand({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex rounded-xl bg-brand-primary px-4 py-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand file, sized by height */}
      <img src="/brand/myalgoagent-logo-white.png" alt="MyAlgoAgent" className="h-7 w-auto" />
    </span>
  );
}
