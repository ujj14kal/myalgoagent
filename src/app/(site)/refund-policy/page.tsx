import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";

export const metadata: Metadata = pageMetadata({
  title: "Refund & Cancellation Policy",
  description: "How cancelling a MyAlgoAgent plan works, and our refund policy: plan payments can be refunded within 3 working days if less than 5% of the credits are used, with a ₹100 charge.",
  path: "/refund-policy",
});

export default function RefundPolicyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Refund & Cancellation Policy", url: `${siteUrl}/refund-policy` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/refund-policy", label: "Refund & Cancellation Policy" }]} />
      <PageHeader eyebrow="Legal" title="Refund & Cancellation Policy" description="Last updated: draft — pending legal review." />
      <Reveal>
        <Prose>
          <h2>Cancelling a plan</h2>
          <p>
            You can stop your plan from renewing at any time from <strong>Plan, credits &amp; billing</strong> in the app. You keep the plan, and its credits and
            features, until the end of the period you have already paid for; after that your account moves to the Free plan. We don&rsquo;t charge a cancellation
            fee, and nothing is charged after you cancel.
          </p>
          <h2>The free trial</h2>
          <p>Every new account starts with a free trial that needs no card. If you don&rsquo;t choose a paid plan, nothing is charged and your account continues on the Free plan.</p>
          <h2>Refunds</h2>
          <p>
            As a general rule we don&rsquo;t give refunds. There is one exception, for your <strong>plan payment</strong> (the Trade or Pro charge that renews
            automatically). We refund it if:
          </p>
          <ul>
            <li>you reach us <strong>within 3 working days</strong> of the payment (Monday to Friday, Indian time; the day you pay counts as day zero), and</li>
            <li><strong>none, or less than 5%</strong>, of that plan period&rsquo;s credits have been used.</li>
          </ul>
          <p>
            When we refund a plan payment, <strong>₹100 is kept as a charge</strong> and the rest goes back to the payment method you used. Your plan then ends and
            renewals stop, and we email you a <strong>credit note</strong> that refers to your original invoice. One-time payments, such as credit top-ups, are final and not refundable.
          </p>
          <h2>How to ask</h2>
          <p>
            Open <Link href="/app/account/payments">Payments &amp; invoices</Link> and choose <strong>Request refund</strong> next to the payment (it appears when the
            payment qualifies), or write to <a href="mailto:support@myalgoagent.com">support@myalgoagent.com</a> with your invoice number. A person on our team
            confirms by email, usually within 3 working days. The refund reaches you through Razorpay; banks and card networks usually take 5–7 working days to show it.
          </p>
          <p>If we ever charge you by mistake, for example twice for the same period, tell us and we will correct it.</p>
          <h2>Questions</h2>
          <p>Write to <a href="mailto:support@myalgoagent.com">support@myalgoagent.com</a> and include the invoice number from your email.</p>
        </Prose>
      </Reveal>
    </>
  );
}
