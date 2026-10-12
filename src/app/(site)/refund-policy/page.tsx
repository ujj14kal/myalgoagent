import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";

export const metadata: Metadata = pageMetadata({
  title: "Refund & Cancellation Policy",
  description: "How cancelling a MyAlgoAgent plan works, and how to ask for a refund: request it from your Payments page, we review every request, and approved refunds go back to your original payment method.",
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
          <h2>Asking for a refund</h2>
          <p>
            If you were charged by mistake (for example twice, or an upgrade you didn&rsquo;t intend), or something went wrong that stopped you using what you paid for,
            open <Link href="/app/account/payments">Payments &amp; invoices</Link>, choose <strong>Request refund</strong> next to the payment and tell us briefly what happened.
            You can also write to <a href="mailto:support@myalgoagent.com">support@myalgoagent.com</a>.
          </p>
          <ul>
            <li>Every request is reviewed by a person on our team; we email you the decision, usually within 3 working days.</li>
            <li>We consider requests case by case, and may refund all or part of a payment. Credits that have been used, or paid features that have been used, are taken into account.</li>
            <li>If we decline, we tell you why, and you can reply to ask us to look again.</li>
          </ul>
          <h2>How the money comes back</h2>
          <p>
            An approved refund goes back to the payment method you paid with, through Razorpay. Banks and card networks usually take 5–7 working days to show it. We email
            you a <strong>credit note</strong> for the refund, which refers to your original invoice.
          </p>
          <p>
            When a refund is approved we may also cancel the plan it paid for, or take back the credits from a refunded top-up (never more than you still hold). We tell you
            in the same email.
          </p>
          <h2>Questions</h2>
          <p>Write to <a href="mailto:support@myalgoagent.com">support@myalgoagent.com</a> and include the invoice number from your email.</p>
        </Prose>
      </Reveal>
    </>
  );
}
