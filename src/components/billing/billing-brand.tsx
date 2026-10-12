/** The MyAlgoAgent wordmark that heads billing screens (the same logo as on invoices). */
export default function BillingBrand({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand file, sized by height
    <img src="/brand/myalgoagent-logo-wide.png" alt="MyAlgoAgent" className={`h-7 w-auto ${className}`} />
  );
}
